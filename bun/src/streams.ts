import { ethers } from 'ethers';
import EventEmitter from 'events';

import { calculateNextBlockBaseFee, estimateNextBlockGas } from './utils';

function streamNewBlocks(wssUrl: string, eventEmitter: EventEmitter): ethers.providers.WebSocketProvider {
    const wss = new ethers.providers.WebSocketProvider(wssUrl);

    wss.on('block', async (blockNumber: number) => {
        let block = await wss.getBlock(blockNumber);
        let nextBaseFee = calculateNextBlockBaseFee(block);
        let estimateGas = await estimateNextBlockGas(); 

        eventEmitter.emit('event', {
            type: 'block',
            blockNumber: block.number,
            baseFee: BigInt(block.baseFeePerGas),
            nextBaseFee,
            ...estimateGas,
        });
    });

    return wss;
}

function streamPendingTransactions(wssUrl: string, eventEmitter: EventEmitter): ethers.providers.WebSocketProvider {
    const wss = new ethers.providers.WebSocketProvider(wssUrl);
    
    wss.on('pending', async (txHash: string) => {
        eventEmitter.emit('event', {
            type: 'pendingTx',
            txHash,
        });
    });

    return wss;
}

function streamUniswapV2Events(wssUrl: string, eventEmitter: EventEmitter): ethers.providers.WebSocketProvider {
    // This stream isn't used in the example DEX arb,
    // but is here to demonstrate how to subscribe to events.
    const wss = new ethers.providers.WebSocketProvider(wssUrl);

    const syncEventSelector = ethers.utils.id('Sync(uint112,uint112)');
    const filter = {topics: [syncEventSelector]};

    wss.on(filter, async (event: any) => {
        eventEmitter.emit('event', event);
    });

    return wss;
}

export {
    streamNewBlocks,
    streamPendingTransactions,
    streamUniswapV2Events,
};
