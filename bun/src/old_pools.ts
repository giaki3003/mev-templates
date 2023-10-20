import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import cliProgress from 'cli-progress';
import { logger, CACHED_POOLS_FILE } from './constants';

const Erc20Abi = ['function decimals() external view returns (uint8)'];
const V2FactoryAbi = ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'];

enum DexVariant {
    UniswapV2 = 2,
    UniswapV3 = 3,
}

const toHex = (number) => "0x" + number.toString(16);

class Pool {
    constructor(
        public address: string,
        public version: DexVariant,
        public token0: string,
        public token1: string,
        public decimals0: number,
        public decimals1: number,
        public fee: number
    ) {}

    cacheRow(): (string | number)[] {
        return [this.address, this.version, this.token0, this.token1, this.decimals0, this.decimals1, this.fee];
    }
}

const range = (start: number, stop: number, step: number): [number, number][] => {
    return Array.from({ length: Math.ceil((stop - start) / step) }, (_, i) => [start + i * step, Math.min(start + (i + 1) * step, stop)]);
}

let cachedPools: Pool[] | null = null;

function loadCachedPools(): Pool[] {
    if (cachedPools) return cachedPools;

    const cacheFile = path.join(__dirname, '..', CACHED_POOLS_FILE);
    const pools: Pool[] = [];
    if (fs.existsSync(cacheFile)) {
        const content = fs.readFileSync(cacheFile, 'utf-8').split('\n').filter(row => row && !row.startsWith('address')).map(row => row.split(','));
        for (const rowData of content) {
            const version = rowData[1] === '2' ? DexVariant.UniswapV2 : DexVariant.UniswapV3;
            const pool = new Pool(rowData[0], version, rowData[2], rowData[3], parseInt(rowData[4]), parseInt(rowData[5]), parseInt(rowData[6]));
            pools.push(pool);
        }
    }
    cachedPools = pools;
    return pools;
}

function cacheSyncedPools(pools: Pool[]): void {
    const cacheFile = path.join(__dirname, '..', CACHED_POOLS_FILE);
    const data = ['address,version,token0,token1,decimals0,decimals1,fee', ...pools.map(pool => pool.cacheRow().join(','))].join('\n');
    fs.writeFileSync(cacheFile, data, { encoding: 'utf-8' });
}

async function loadAllPoolsFromV2(
    httpsUrl: string,
    factoryAddresses: string[],
    fromBlocks: number[],
    chunk: number
): Promise<Pool[]> {
    console.log("loadAllPoolsFromV2 function started.");
    console.log(`Factory Addresses: ${JSON.stringify(factoryAddresses)}`);
    console.log(`From Blocks: ${JSON.stringify(fromBlocks)}`);

    //let pools = loadCachedPools();
    //if (pools.length > 0) return pools;

    const client = createPublicClient({
        chain: mainnet,
        transport: http(httpsUrl),
    });

    const decimals: Record<string, number> = {};

    console.log(`Starting loop over factoryAddresses with count: ${factoryAddresses.length}`);

    for (let i = 0; i < factoryAddresses.length; i++) {

        const factoryAddress = factoryAddresses[i];
        const fromBlock = fromBlocks[i];
        const requestParams = range(fromBlock, Number(await client.getBlockNumber()), chunk);

        const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progress.start(requestParams.length);

        const fetchEvents = async (params: [number, number]) => {
            const filter = {
                ...V2FactoryAbi,
                address: factoryAddress,
                functionName: 'PairCreated',
                fromBlock: toHex(params[0]),
                toBlock: toHex(params[1])
            };
            return await client.getLogs(filter);
        };

        const eventGroups = await Promise.all(requestParams.map(fetchEvents));

        for (const events of eventGroups) {
            console.log(`Events fetched for block range ${params[0]} - ${params[1]}: ${events.length}`);
            for (const event of events) {
                const [token0, token1] = [event.args[0], event.args[1]];

                const fetchDecimals = async (token: string) => {
                    if (token in decimals) return decimals[token];
                    const result = await client.callContract({
                        address: token,
                        abi: Erc20Abi,
                        functionName: 'decimals'
                    });
                    decimals[token] = parseInt(result, 10);
                    console.log(`Decimals fetched for token ${token}: ${decimals[token]}`);
                    return decimals[token];
                };

                try {
                    const [decimals0, decimals1] = await Promise.all([fetchDecimals(token0), fetchDecimals(token1)]);
                    const pool = new Pool(event.args[2], DexVariant.UniswapV2, token0, token1, decimals0, decimals1, 300);
                    console.log(`New pool added: ${pool.address}`);
                    pools.push(pool);
                } catch (_) {
                    logger.warn(`Check if tokens: ${token0} / ${token1} still exists`);
                }
            }
            progress.increment();
        }

        progress.stop();
    }

    cacheSyncedPools(pools);
    return pools;
}

export {
    loadAllPoolsFromV2,
};

