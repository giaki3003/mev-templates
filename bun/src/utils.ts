import { ethers } from 'ethers';
import axios from 'axios';

import { 
    BLOCKNATIVE_TOKEN,
    CHAIN_ID,
} from './constants';

const GWEI = BigInt(10 ** 9);
const syncEventSelector = ethers.utils.id('Sync(uint112,uint112)');
const abiCoder = new ethers.utils.AbiCoder();

const calculateNextBlockBaseFee = (block: any): bigint => {
    const baseFee = BigInt(block.baseFeePerGas);
    const gasUsed = BigInt(block.gasUsed);
    const gasLimit = BigInt(block.gasLimit);
    const targetGasUsed = gasLimit / 2n || 1n;
    const delta = baseFee * (gasUsed - targetGasUsed) / targetGasUsed / 8n;
    return gasUsed > targetGasUsed ? baseFee + delta : baseFee - delta + BigInt(Math.floor(Math.random() * 10));
};

async function estimateNextBlockGas(): Promise<GasEstimate> {
    if (!BLOCKNATIVE_TOKEN || ![1, 137].includes(parseInt(CHAIN_ID))) return {};

    const url = `https://api.blocknative.com/gasprices/blockprices?chainid=${CHAIN_ID}`;
    const { data } = await axios.get(url, { headers: { Authorization: BLOCKNATIVE_TOKEN } });

    if (!data) return {};

    const estimatedPrice = data.blockPrices[0].estimatedPrices[0];
    return {
        maxPriorityFeePerGas: BigInt(Math.round(estimatedPrice.maxPriorityFeePerGas * Number(GWEI))),
        maxFeePerGas: BigInt(Math.round(estimatedPrice.maxFeePerGas * Number(GWEI)))
    };
}

async function getTouchedPoolReserves(provider: ethers.providers.Provider, blockNumber: number): Promise<Record<string, [bigint, bigint]>> {
    const logs = await provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [syncEventSelector],
    });

    const reserves: Record<string, [bigint, bigint]> = {};
    const txIdx: Record<string, number> = {};

    for (const log of logs) {
        const address = log.address;
        const idx = log.transactionIndex;
        if (idx >= (txIdx[address] || 0)) {
            const [reserve0, reserve1] = abiCoder.decode(['uint112', 'uint112'], log.data) as [number, number];
            reserves[address] = [BigInt(reserve0), BigInt(reserve1)];
            txIdx[address] = idx;
        }
    }

    return reserves;
}

export {
    calculateNextBlockBaseFee,
    estimateNextBlockGas,
    getTouchedPoolReserves,
};
