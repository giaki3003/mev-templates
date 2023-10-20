class UniswapV2Simulator {
    constructor() {}

    reservesToPrice(
        reserve0: bigint | number,
        reserve1: bigint | number,
        decimals0: number,
        decimals1: number,
        token0In: boolean
    ): number {
        const price = (Number(reserve1) / Number(reserve0)) * 10 ** (decimals0 - decimals1);
        return token0In ? price : 1 / price;
    }

    getAmountOut(
        amountIn: bigint | number,
        reserveIn: bigint | number,
        reserveOut: bigint | number,
        fee: bigint | number
    ): number {
        const feeFactor = BigInt(1000) - fee / BigInt(100);
        const amountInWithFee = BigInt(amountIn) * feeFactor;
        const numerator = amountInWithFee * BigInt(reserveOut);
        const denominator = (BigInt(reserveIn) * BigInt(1000)) + amountInWithFee;

        return denominator === BigInt(0) ? 0 : Number(numerator / denominator);
    }
}

export {
    UniswapV2Simulator,
};
