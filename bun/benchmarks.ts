import fs from 'fs';
import path from 'path';
import uuid from 'uuid';
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import microtime from 'microtime';
import EventEmitter from 'events';
import axios from 'axios';

import { 
    HTTPS_URL,
    WSS_URL,
    PRIVATE_KEY,
    SIGNING_KEY,
    BOT_ADDRESS,
    ZERO_ADDRESS,
    UNISWAP_2FACTORY,
    SUSHI_FACTORY,
    USDC_ADDRESS,
} from './src/constants';
import { loadAllPoolsFromV2 } from './src/pools';
import { generateTriangularPaths } from './src/paths';
import { getUniswapV2Reserves, batchGetUniswapV2Reserves, example1 } from './src/multi';
import { streamNewBlocks, streamPendingTransactions } from './src/streams';
import { getTouchedPoolReserves, calculateNextBlockBaseFee } from './src/utils';
import { Bundler, Flashloan } from './src/bundler';

function loggingEventHandler(eventEmitter: EventEmitter): void {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(HTTPS_URL)
    })

    eventEmitter.on('event', async (event: any) => {
        if (event.type === 'pendingTx') {
            try {
                const tx = await client.getTransaction(event.txHash);
                const now = microtime.now();
                const row = [tx.hash, now].join(',') + '\n';
                fs.appendFileSync(path.join(__dirname, 'benches', '.benchmark.csv'), row, { encoding: 'utf-8' });
            } catch {
                // pass
            }
        }
    });
}

function touchedPoolsEventHandler(eventEmitter: EventEmitter): void {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(HTTPS_URL)
    })
    
    eventEmitter.on('event', async (event: any) => {
        if (event.type === 'block') {
            const s = microtime.now();
            const reserves = await getTouchedPoolReserves(client, event.blockNumber);
            const took = (microtime.now() - s) / 1000;
            const now = Date.now();
            console.log(`[${now}] Block #${event.blockNumber} ${Object.keys(reserves).length} pools touched | Took: ${took} ms`);
        }
    });
}

async function benchmarkStreams(streamFunc: Function, handlerFunc: Function, runTime: number): Promise<void> {
    const eventEmitter = new EventEmitter();

    const wss = await streamFunc(WSS_URL, eventEmitter);
    await handlerFunc(eventEmitter);

    setTimeout(async () => {
        await wss.destroy();
        eventEmitter.removeAllListeners();
    }, runTime * 1000);
}

async function benchmarkFunction(): Promise<void> {
    let avg, sum, i, s, took, arr;



    // 1. Create HTTP provider
    s = microtime.now();
    const client = createPublicClient({
      chain: mainnet,
      transport: http(HTTPS_URL)
    })
    took = microtime.now() - s;
    console.log(`1.Viem HTTP provider created | Took: ${took} microsec`);
    //arr.push(took);
    //i++;
    //}

    //console.log(average(arr))   
    // 2. Get block info
    
    i = 0;
    arr = [];
    avg = 0;
    while (i < 15) {
        s = microtime.now();
        let block = await client.getBlock('latest');
        took = (microtime.now() - s);
        //console.log(`2. New block: #${block.number} | Took: ${took} microsec`);
        //console.log(average(arr))
        arr.push(took);
        i++;
    }
    sum = arr.reduce((a, b) => a + b, 0);
    avg = (sum / arr.length) || 0;
    console.log(`viem ${avg} microseconds`)


    // Common variables used throughout
    //const factoryAddresses = [UNISWAP_2FACTORY];
    const factoryAddresses = ['0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'];
    const factoryBlocks = [10794229];
    const usdcDecimals = 6;

    // 3. Retrieving cached pools data
    s = microtime.now();
    let pools = await loadAllPoolsFromV2(HTTPS_URL, factoryAddresses, factoryBlocks, 2000);
    took = (microtime.now() - s) / 1000;
    console.log(`3. Cached ${Object.keys(pools).length} pools data | Took: ${took} ms`);

    let res_example1 = await example1(HTTPS_URL);

    console.log("3.1 first 10 pools");
    console.log(Object.keys(pools).slice(0, 10));

    // 4. Generate triangular arbitrage paths
    s = microtime.now();
    let paths = generateTriangularPaths(pools, USDC_ADDRESS);
    took = (microtime.now() - s) / 1000;
    console.log(`4. Generated ${paths.length} 3-hop paths | Took: ${took} ms`);

    // 5. Multicall test: calling 250 requests using multicall
    let reserves;

    // Single multicall request
    s = microtime.now()
    reserves = await getUniswapV2Reserves(HTTPS_URL, Object.keys(pools).slice(0, 250));
    took = (microtime.now() - s) / 1000;
    console.log(`5. Multicall result for ${Object.keys(reserves).length} | Took: ${took} ms`);

    // Batch multicall requests
    s = microtime.now();
    reserves = await batchGetUniswapV2Reserves(HTTPS_URL, Object.keys(pools));
    took = (microtime.now() - s) / 1000;
    console.log(`5. Bulk multicall result for ${Object.keys(reserves).length} | Took: ${took} ms`);

/*
    let streamFunc;
    let handlerFunc;

    // 6. Pending transaction async stream
    // streamFunc = streamPendingTransactions;
    // handlerFunc = loggingEventHandler;
    // console.log('6. Logging receive time for pending transaction streams. Wait 180 seconds...');
    // await benchmarkStreams(streamFunc, handlerFunc, 180);

    // 7. Retrieving logs from a newly created block
    // streamFunc = streamNewBlocks;
    // handlerFunc = touchedPoolsEventHandler;
    // console.log('7. Starting touched pools with new blocks streams. Wait 300 seconds...');
    // await benchmarkStreams(streamFunc, handlerFunc, 300);

    // 8. 3-hop path simulation
    took = paths.map(path => {
        s = microtime.now();
        let amountIn = 1;
        let _ = path.simulateV2Path(amountIn, reserves);
        let took = microtime.now() - s;
        return took;
    });
    let totalTook = took.reduce((x, y) => x + y, 0);
    console.log(`8. 3-hop path simulation took: ${totalTook} microsecs in total (${took.length} simulations)`);

    // 9. Creating Flashbots bundles
    let unit = 10 ** usdcDecimals;
    let gwei = 10 ** 9;
    let routerAddress = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';

    const bundler = new Bundler(PRIVATE_KEY, SIGNING_KEY, HTTPS_URL, BOT_ADDRESS);
    await bundler.setup();

    s = microtime.now();
    routers = [routerAddress, routerAddress, routerAddress];
    let path = paths[0];
    let pathParams = path.toPathParams(routers);
    let amountIn = 1 * unit;
    let flashloan = Flashloan.NotUsed;
    let loanFrom = ZERO_ADDRESS;
    let maxPriorityFeePerGas = 1 * gwei;
    let maxFeePerGas = 50 * gwei;
    let orderTx = await bundler.orderTx(pathParams, amountIn, flashloan, loanFrom, maxPriorityFeePerGas, maxFeePerGas);
    let bundle = await bundler.toBundle(orderTx);
    let signedBundle = await bundler.flashbots.signBundle(bundle);
    took = (microtime.now() - s) / 1000;
    console.log(`9. Creating Flashbots bundle | Took: ${took} ms`);
    console.log(signedBundle);

    // 10. Sending Flashbots bundles
    block = await provider.getBlock('latest');
    blockNumber = block.number;
    let nextBaseFee = calculateNextBlockBaseFee(block);
    maxPriorityFeePerGas = BigInt(1);
    maxFeePerGas = nextBaseFee + maxPriorityFeePerGas;

    let time = [];
    for (let i = 0; i < 10; i++) {
        let _s = microtime.now();
        s = microtime.now();
        let common = await bundler._common_fields();
        amountIn = BigInt(parseInt(0.001 * 10 ** 18));
        let tx = {
            ...common,
            to: bundler.sender.address,
            from: bundler.sender.address,
            value: amountIn,
            data: '0x',
            gasLimit: BigInt(30000),
            maxFeePerGas,
            maxPriorityFeePerGas,
        };
        bundle = await bundler.toBundle(tx);
        signedBundle = await bundler.flashbots.signBundle(bundle);
        took = (microtime.now() - s) / 1000;
        console.log(`- Creating bundle took: ${took} ms`);
    
        s = microtime.now();
        const simulation = await bundler.flashbots.simulate(signedBundle, blockNumber);
    
        if ('error' in simulation) {
            console.warn(`Simulation Error`);
        } else {
            console.log(`Simulation Success`);
        }
        took = (microtime.now() - s) / 1000;
        console.log(`- Running simulation took: ${took} ms`);
    
        s = microtime.now();
        const targetBlock = blockNumber + 1;
        const replacementUuid = uuid.v4();
        const bundleSubmission = await bundler.flashbots.sendRawBundle(signedBundle, targetBlock, { replacementUuid });
    
        if ('error' in bundleSubmission) {
            console.warn('Bundle send error');
        }
        took = (microtime.now() - s) / 1000;
        let totalTook = (microtime.now() - _s) / 1000;
        console.log(`10. Sending Flashbots bundle ${bundleSubmission.bundleHash} | Took: ${took} ms`);

        time.push(totalTook);
    }

    console.log(time.reduce((x, y) => x + y, 0));
/*/
}

(async () => {
    await benchmarkFunction();
})();