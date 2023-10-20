import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { ethers } from 'ethers';
import { mainnet } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import cliProgress from 'cli-progress';
import { logger, CACHED_POOLS_FILE, UNISWAP_2FACTORY_ABI, Erc20Abi, V2FactoryAbi , UNISWAP_2FACTORY} from './constants';

const UniswapV2PairAbiIMPORT = require('../abi/UniswapV2Pair.json');

const humanABI = ['event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'];

enum DexVariant {
    UniswapV2 = 2,
    UniswapV3 = 3,
}

class Pool {
    address: string;
    version: DexVariant;
    token0: string;
    token1: string;
    decimals0: number;
    decimals1: number;
    fee: number;

    constructor(
        address: string,
        version: DexVariant,
        token0: string,
        token1: string,
        decimals0: number,
        decimals1: number,
        fee: number
    ) {
        this.address = address;
        this.version = version;
        this.token0 = token0;
        this.token1 = token1;
        this.decimals0 = decimals0;
        this.decimals1 = decimals1;
        this.fee = fee;
    }

    cacheRow(): (string | number)[] {
        return [
            this.address,
            this.version,
            this.token0,
            this.token1,
            this.decimals0,
            this.decimals1,
            this.fee,
        ];
    }
}

/*
const range = (start: number, stop: number, step: number): [number, number][] => {
    return Array.from({ length: Math.ceil((stop - start) / step) }, (_, i) => [start + i * step, Math.min(start + (i + 1) * step, stop)]);
}
*/

const range = (start: BigInt, stop: BigInt, step: BigInt): [BigInt, BigInt][] => {
    const length = (stop - start + BigInt(1)) / step;
    return Array.from({ length: Number(length) }, (_, i) => {
        const from = start + BigInt(i) * step;
        const to = (from + step > stop) ? stop : from + step;
        return [from, to];
    });
}


function loadCachedPools(): {} {
    const cacheFile = path.join(__dirname, '..', CACHED_POOLS_FILE);
    const pools: { [address: string]: Pool } = {};
    if (fs.existsSync(cacheFile)) {
        const content = fs.readFileSync(cacheFile, 'utf-8').split('\n');
        for (const row of content) {
            const rowData = row.split(',');
            if (rowData[0] !== 'address') {
                const version = rowData[1] === '2' ? DexVariant.UniswapV2 : DexVariant.UniswapV3;
                const pool = new Pool(rowData[0], version, rowData[2], rowData[3], parseInt(rowData[4]), parseInt(rowData[5]), parseInt(rowData[6]));
                pools[rowData[0]] = pool;
            }
        }
    }
    return pools;
}

function cacheSyncedPools(pools): void {
    const columns = ['address', 'version', 'token0', 'token1', 'decimals0', 'decimals1', 'fee'];
    let data = columns.join(',') + '\n';
    for (const address in pools) {
        const pool = pools[address];
        const row = pool.cacheRow().join(',') + '\n';
        data += row;
    }
    const cacheFile = path.join(__dirname, '..', CACHED_POOLS_FILE);
    fs.writeFileSync(cacheFile, data, { encoding: 'utf-8' });
}

async function getDecimalsForToken(tokenAddress: string, decimalsCache: {[address: string]: number}, client) {
    if (decimalsCache[tokenAddress]) {
        return decimalsCache[tokenAddress];
    }
    const result = await client.readContract({
      address: tokenAddress,
      abi: UNISWAP_2FACTORY_ABI,
      functionName: 'decimals',
    })
    const decimals = parseInt(result, 10);
    decimalsCache[tokenAddress] = decimals;
    return decimals;
}

function bigIntReplacer(_, value) {
    if (typeof value === 'bigint') {
        return value.toString() + 'n'; // Represent the BigInt as a string followed by 'n'
    }
    return value;
}

const V2FactoryAbiNative = [
    'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
];

const rangeNum = (start, stop, step) => {
    let loopCnt = Math.ceil((stop - start) / step);
    let rangeArray = [];
    for (let i = 0; i < loopCnt; i++) {
        let fromBlock = start + (i * step);
        let toBlock = Math.min(fromBlock + step, stop);
        rangeArray.push([fromBlock, toBlock]);
    }
    return rangeArray;
}
/*
async function loadAllPoolsFromV2(
    httpsUrl: string,
    factoryAddresses: string[],
    fromBlocks: number[],
    chunk: number
): Promise<{ [address: string]: Pool }> {

    // Caching (?)
    //let pools = loadCachedPools();
    //if (Object.keys(pools).length > 0) return pools;

    const client = createPublicClient({
        chain: mainnet,
        transport: http(httpsUrl),
    });

    const provider = new ethers.providers.JsonRpcProvider(httpsUrl);

    const toBlock = BigInt(await client.getBlockNumber());
    const decimalsCache = {};
    const pools = {};

    for (const [index, factoryAddress] of factoryAddresses.entries()) {

        const v2Factory = new ethers.Contract(factoryAddress, V2FactoryAbiNative, provider);

        const requestParams = range(BigInt(fromBlocks[index]), toBlock, BigInt(chunk));
        const requestParamsNum = rangeNum(fromBlocks[index], Number(toBlock), chunk);
        const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progress.start(requestParams.length);

        for (const [from, to] of requestParamsNum) {

            console.log(`Processing from ${from} to ${to}`);

            const filter = v2Factory.filters.PairCreated;
            const events_ethers = await v2Factory.queryFilter(filter, from, to);
            for (const event of events_ethers) {
                console.log(`Event-ethers args: ${JSON.stringify(events_ethers.args, bigIntReplacer)}`);
            }

        }

        for (const [from, to] of requestParams) {

            const events = await client.getContractEvents({
                ...UNISWAP_2FACTORY,
                eventName: 'PairCreated',
                fromBlock: BigInt(from),
                toBlock: BigInt(to)
            });


            for (const event of events) {
                console.log(`Found event: ${JSON.stringify(event, bigIntReplacer)}`);
                console.log(`Event args: ${JSON.stringify(event.args, bigIntReplacer)}`);
                const token0 = event.args[0];
                const token1 = event.args[1];
                const pair = event.args[2]; // Extract the pair address


                try {
                    const decimals0 = await getDecimalsForToken(token0, decimalsCache, client);
                    const decimals1 = await getDecimalsForToken(token1, decimalsCache, client);
                    const pool = new Pool(event.args[2], DexVariant.UniswapV2, token0, token1, decimals0, decimals1, 300);
                    pools[event.args[2]] = pool;
                } catch (error) {
                    logger.warn(`Failed to fetch decimals for tokens: ${token0} / ${token1}. Error: ${error.message}`);
                }
            }

            progress.increment();
        }

        progress.stop();
    }

    cacheSyncedPools(pools);
    return pools;
}

*/
/*
async function loadAllPoolsFromV2(
    httpsUrl: string,
    factoryAddresses: string[],
    fromBlocks: number[],
    chunk: number
): Promise<{ [address: string]: Pool }> {

    const client = createPublicClient({
        chain: mainnet,
        transport: http(httpsUrl),
    });

    const toBlock = BigInt(await client.getBlockNumber());

    const provider = new ethers.providers.JsonRpcProvider(httpsUrl);
    const toBlockEthers = await provider.getBlockNumber();
    const decimalsCache = {};
    const pools = {};

    for (let index = 0; index < factoryAddresses.length; index++) {

        const requestParamsBig = range(BigInt(fromBlocks[index]), toBlock, BigInt(chunk));
        const factoryAddress = factoryAddresses[index];
        const v2Factory = new ethers.Contract(factoryAddress, V2FactoryAbi, provider);

        const iface = new ethers.utils.Interface(UniswapV2PairAbiIMPORT);
        console.log(`Interface: ${iface.format(ethers.utils.FormatTypes.full)}`);

        //fs.writeFileSync('interface.txt', iface.format(ethers.utils.FormatTypes.full), null, 2);

        const formattedInterface = iface.format(ethers.utils.FormatTypes.full).join(',\n');
        fs.writeFileSync("interface.txt", formattedInterface);

        const abiItem = parseAbi(humanABI);
        console.log(`AbiItem: ${JSON.stringify(abiItem)}`);

        for (let i = 0; i < requestParamsBig.length; i++) {
            const [from, to] = requestParamsBig[i];
            const events = await client.getContractEvents({
                abi: abiItem,
                address: factoryAddress,
                eventName: 'PairCreated',
                fromBlock: BigInt(from),
                toBlock: BigInt(to),
                strict: true
            });

            for (const event of events) {
                console.log(`Event-viem args: ${JSON.stringify(event.args, bigIntReplacer)}`);
                break;
            }
            break;
        }

        const requestParams = rangeNum(fromBlocks[index], toBlockEthers, chunk);
        const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progress.start(requestParams.length);

        for (let i = 0; i < requestParams.length; i++) {
            const [from, to] = requestParams[i];
            const filter = v2Factory.filters.PairCreated;
            const events = await v2Factory.queryFilter(filter, from, to);

            for (const event of events) {
                console.log(`Event-ether args: ${JSON.stringify(event.args, bigIntReplacer)}`);
            }

            progress.increment();
        }

        progress.stop();
    }

    cacheSyncedPools(pools);
    return pools;
}
/*
async function loadAllPoolsFromV2(
    httpsUrl: string,
    factoryAddresses: string[],
    fromBlocks: number[],
    chunk: number
): Promise<{ [address: string]: Pool }> {

    const client = createPublicClient({
        chain: mainnet,
        transport: http(httpsUrl)
    });

    const toBlock = BigInt(await client.getBlockNumber());
    const requestParamsBig = range(BigInt(fromBlocks[index]), toBlock, BigInt(chunk));
    const decimalsCache = {};
    const pools = {};

    for (let index = 0; index < factoryAddresses.length; index++) {
        for (let i = 0; i < requestParamsBig.length; i++) {
            const [from, to] = requestParamsBig[i];
            const events = await client.getContractEvents({
                abi: abiItem,
                address: factoryAddress,
                eventName: 'PairCreated',
                fromBlock: BigInt(from),
                toBlock: BigInt(to),
                strict: true
            });

            for (const event of events) {
                console.log(`Event-viem args: ${JSON.stringify(event.args, bigIntReplacer)}`);
                break;
            }
            break;
        }
    }

  // The first multicall computes the address of the DAI/USDC pool for each fee tier.
  const poolAddrCalls = FEE_TIERS.map((fee) => {
    return {
      ...UNISWAP_3FACTORY,
      functionName: 'getPool',
      args: [DAI_ADDRESS, USDC_ADDRESS, fee],
    } as const;
  });

  // Execute the multicall and get the pool addresses. None of these calls can fail so we set
  // `allowFailure` to false. This results in each return value's type matching the type of the
  // corresponding call, e.g. `0x${string}` for addresses, `bigint` for uint256, etc. If we set
  // `allowFailure` to true then the returns types are of the following shape, using the example of
  // the address return type:
  //   {
  //       error: Error;
  //       result?: undefined;
  //       status: "error";
  //   } | {
  //       error?: undefined;
  //       result: `0x${string}`;
  //       status: "success";
  //   }
  const poolAddresses = await client.multicall({ contracts: poolAddrCalls, allowFailure: false });
  console.log('DAI/USDC Pool Addresses');
  const percentages = FEE_TIERS.map((fee) =>
    (fee / 1e6).toLocaleString(undefined, {
      style: 'percent',
      minimumIntegerDigits: 1,
      minimumFractionDigits: 2,
    })
  );
  percentages.map((percent, i) => console.log(`  ${percent} pool: ${poolAddresses[i]}`));

  // For each pool, let's get the DAI and USDC balances.
  const balanceOfAbi = parseAbi([
    'function balanceOf(address who) external view returns (uint256 balance)',
  ]);
  const DAI = { address: DAI_ADDRESS, abi: balanceOfAbi } as const;
  const USDC = { address: USDC_ADDRESS, abi: balanceOfAbi } as const;

  const balanceCalls = poolAddresses
    .map((poolAddress) => {
      return [
        { ...DAI, functionName: 'balanceOf', args: [poolAddress] } as const,
        { ...USDC, functionName: 'balanceOf', args: [poolAddress] } as const,
      ];
    })
    .flat();

  // Execute the multicall and log the results.
  const balances = await client.multicall({ contracts: balanceCalls, allowFailure: false });

  console.log('DAI/USDC Pool Balances');
  balances.map((balance, i) => {
    const token = i % 2 === 0 ? 'DAI' : 'USDC';
    const decimals = i % 2 === 0 ? 18 : 6;
    const percent = percentages[Math.floor(i / 2)];
    const amount = Number(formatUnits(balance, decimals)).toLocaleString(undefined, {});
    const spacer = ' '.repeat(5 - token.length);
    console.log(`  ${percent} pool ${token} balance:${spacer}${amount}`);
  });
}
*/

async function loadAllPoolsFromV2(
    httpsUrl: string,
    factoryAddresses: string[],
    fromBlocks: number[],
    chunk: number
): Promise<{ [address: string]: Pool }> {

    console.log("loadAllPoolsFromV2 function started.");
    console.log(`Factory Addresses: ${JSON.stringify(factoryAddresses)}`);
    console.log(`From Blocks: ${JSON.stringify(fromBlocks)}`);

    let pools = loadCachedPools();
    if (Object.keys(pools).length > 0) return pools;

    const client = createPublicClient({
        chain: mainnet,
        transport: http(httpsUrl),
    });

    const toBlock = await client.getBlockNumber();
    const decimals: { [token: string]: number } = {};
    pools = {};

    for (const factoryAddress of factoryAddresses) {
        const requestParams = range(fromBlocks[0], Number(toBlock), chunk);

        const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progress.start(requestParams.length);

        for (const params of requestParams) {

            const events = await client.getContractEvents({
                abi: UNISWAP_2FACTORY_ABI,
                eventName: 'PairCreated',
                fromBlock: params[0],
                toBlock: params[1]
            })

            //const events = await client.getLogs(filter);

            console.log(`Found ${events.length} events.`);

            for (const event of events) {
                const token0 = event.args[0];
                const token1 = event.args[1];

                if (!decimals[token0]) {
                    const result = await client.callContract({
                        address: token0,
                        abi: Erc20Abi,
                        functionName: 'decimals'
                    });
                    decimals[token0] = parseInt(result, 10);
                }

                if (!decimals[token1]) {
                    const result = await client.callContract({
                        address: token1,
                        abi: Erc20Abi,
                        functionName: 'decimals'
                    });
                    decimals[token1] = parseInt(result, 10);
                }

                const pool = new Pool(event.args[2], DexVariant.UniswapV2, token0, token1, decimals[token0], decimals[token1], 300);
                pools[event.args[2]] = pool;
            }

            progress.increment();
        }

        progress.stop();
    }

    const poolsArray = Object.values(pools);

    cacheSyncedPools(poolsArray);
    return poolsArray;
}

export {
    loadAllPoolsFromV2,
};
