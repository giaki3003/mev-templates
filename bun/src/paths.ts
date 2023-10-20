import cliProgress from 'cli-progress';
import { logger } from './constants';
import { Path } from './bundler';
import { UniswapV2Simulator } from './simulator';

const range = (start: number, stop: number, step: number): number[] => {
    return Array.from({ length: Math.ceil((stop - start) / step) }, (_, i) => start + i * step);
}

class ArbPath {
    constructor(
        public pool1: any,
        public pool2: any,
        public pool3: any,
        public zeroForOne1: boolean,
        public zeroForOne2: boolean,
        public zeroForOne3: boolean
    ) {}

    nhop(): number {
        return this.pool3 === undefined ? 2 : 3;
    }

    hasPool(pool: string): boolean {
        return [this.pool1, this.pool2, this.pool3].some(p => p && p.address.toLowerCase() === pool.toLowerCase());
    }

    shouldBlacklist(blacklistTokens: string[]): boolean {
        return [this.pool1, this.pool2, this.pool3].some(pool => pool && (blacklistTokens.includes(pool.token0) || blacklistTokens.includes(pool.token1)));
    }

    simulateV2Path(amountIn: number, reserves: any): number {
        const tokenInDecimals = this.zeroForOne1 ? this.pool1.decimals0 : this.pool1.decimals1;
        let amountOut = amountIn * 10 ** tokenInDecimals;

        const sim = new UniswapV2Simulator();
        const nhop = this.nhop();
        for (let i = 0; i < nhop; i++) {
            const pool = this[`pool${i + 1}`];
            const zeroForOne = this[`zeroForOne${i + 1}`];
            const [reserve0, reserve1] = reserves[pool.address];
            const fee = pool.fee;
            const [reserveIn, reserveOut] = zeroForOne ? [reserve0, reserve1] : [reserve1, reserve0];
            amountOut = sim.getAmountOut(amountOut, reserveIn, reserveOut, fee);
        }
        return amountOut;
    }

    optimizeAmountIn(maxAmountIn: number, stepSize: number, reserves: any): [number, number] {
        const tokenInDecimals = this.zeroForOne1 ? this.pool1.decimals0 : this.pool1.decimals1;
        let optimizedIn = 0;
        let profit = 0;
        for (const amountIn of range(0, maxAmountIn, stepSize)) {
            const amountOut = this.simulateV2Path(amountIn, reserves);
            const thisProfit = amountOut - (amountIn * (10 ** tokenInDecimals));
            if (thisProfit >= profit) {
                optimizedIn = amountIn;
                profit = thisProfit;
            } else {
                break;
            }
        }
        return [optimizedIn, profit / (10 ** tokenInDecimals)];
    }

    toPathParams(routers: any[]): Path[] {
        return Array.from({ length: this.nhop() }, (_, i) => {
            const pool = this[`pool${i + 1}`];
            const zeroForOne = this[`zeroForOne${i + 1}`];
            const [tokenIn, tokenOut] = zeroForOne ? [pool.token0, pool.token1] : [pool.token1, pool.token0];
            return new Path(routers[i], tokenIn, tokenOut);
        });
    }
}

function generateTriangularPaths(pools: any, tokenIn: string): ArbPath[] {
    const paths: ArbPath[] = [];

    pools = Object.values(pools);

    const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progress.start(pools.length);

    for (const pool1 of pools) {
        if (![pool1.token0, pool1.token1].includes(tokenIn)) continue;
        const zeroForOne1 = pool1.token0 === tokenIn;
        const tokenOut1 = zeroForOne1 ? pool1.token1 : pool1.token0;

        for (const pool2 of pools) {
            if (![pool2.token0, pool2.token1].includes(tokenOut1)) continue;
            const zeroForOne2 = pool2.token0 === tokenOut1;
            const tokenOut2 = zeroForOne2 ? pool2.token1 : pool2.token0;

            for (const pool3 of pools) {
                if (![pool3.token0, pool3.token1].includes(tokenOut2)) continue;
                const zeroForOne3 = pool3.token0 === tokenOut2;
                const tokenOut3 = zeroForOne3 ? pool3.token1 : pool3.token0;

                if (tokenOut3 === tokenIn && new Set([pool1.address, pool2.address, pool3.address]).size === 3) {
                    paths.push(new ArbPath(pool1, pool2, pool3, zeroForOne1, zeroForOne2, zeroForOne3));
                }
            }
        }
        progress.increment();
    }

    progress.stop();
    logger.info(`Generated ${paths.length} 3-hop arbitrage paths`);
    return paths;
}

export {
    ArbPath,
    generateTriangularPaths,
};
