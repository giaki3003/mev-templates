import { ethers } from 'ethers';
import EventEmitter from 'events';

import {
    HTTPS_URL,
    WSS_URL,
    PRIVATE_KEY,
    SIGNING_KEY,
    BOT_ADDRESS,
    logger,
    blacklistTokens
} from './constants';
import { loadAllPoolsFromV2 } from './pools';
import { generateTriangularPaths } from './paths';
import { batchGetUniswapV2Reserves } from './multi';
import { streamNewBlocks } from './streams';
import { getTouchedPoolReserves } from './utils';
import { Bundler } from './bundler';

async function main(): Promise<void> {
    const provider = new ethers.providers.JsonRpcProvider(HTTPS_URL);

    const factoryAddresses: string[] = ['0xc35DADB65012eC5796536bD9864eD8773aBc74C4'];
    const factoryBlocks: number[] = [11333218];

    let pools = await loadAllPoolsFromV2(
        HTTPS_URL, factoryAddresses, factoryBlocks, 50000
    );
    logger.info(`Initial pool count: ${Object.keys(pools).length}`);

    const usdcAddress: string = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    const usdcDecimals: number = 6;

    const paths = generateTriangularPaths(pools, usdcAddress);

    // Filter pools that were used in arb paths
    pools = paths.reduce((acc, path) => {
        if (!path.shouldBlacklist(blacklistTokens)) {
            acc[path.pool1.address] = path.pool1;
            acc[path.pool2.address] = path.pool2;
            acc[path.pool3.address] = path.pool3;
        }
        return acc;
    }, {} as typeof pools);
    logger.info(`New pool count: ${Object.keys(pools).length}`);

    const startTime = Date.now();
    const reserves = await batchGetUniswapV2Reserves(HTTPS_URL, Object.keys(pools));
    logger.info(`Batch reserves call took: ${(Date.now() - startTime) / 1000} seconds`);

    const bundler = new Bundler(
        PRIVATE_KEY,
        SIGNING_KEY,
        HTTPS_URL,
        BOT_ADDRESS,
    );
    await bundler.setup();
    
    const eventEmitter = new EventEmitter();
    streamNewBlocks(WSS_URL, eventEmitter);
    
    eventEmitter.on('event', async (event: any) => {
        if (event.type === 'block') {
            const { blockNumber } = event;
            logger.info(`▪️ New Block #${blockNumber}`);

            const touchedReserves = await getTouchedPoolReserves(provider, blockNumber);
            const touchedPools = Object.keys(touchedReserves).filter(address => address in reserves);

            touchedPools.forEach(address => {
                reserves[address] = touchedReserves[address];
            });

            const spreads: { [key: number]: number } = {};
            paths.forEach((path, idx) => {
                if (touchedPools.some(pool => path.hasPool(pool))) {
                    const priceQuote = path.simulateV2Path(1, reserves);
                    const spread = (priceQuote / (10 ** usdcDecimals) - 1) * 100;
                    if (spread > 0) spreads[idx] = spread;
                }
            });

            console.log('▶️ Spread over 0%: ', spreads);
        }
    });
}

export {
    main,
};
