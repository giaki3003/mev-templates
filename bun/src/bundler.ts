import { ethers, Wallet } from 'ethers';
import { FlashbotsBundleProvider } from 'flashbots-ethers-v6-provider-bundle';
import * as uuid from 'uuid';
import { BOT_ABI, PRIVATE_RELAY } from './constants';

class Path {
    router: string;
    tokenIn: string;
    tokenOut: string;

    constructor(router: string, tokenIn: string, tokenOut: string) {
        this.router = router;
        this.tokenIn = tokenIn;
        this.tokenOut = tokenOut;
    }

    toList(): string[] {
        return [this.router, this.tokenIn, this.tokenOut];
    }
}

enum Flashloan {
    NotUsed = 0,
    Balancer = 1,
    UniswapV2 = 2,
}

class Bundler {
    private provider: ethers.providers.JsonRpcProvider;
    private sender: Wallet;
    private signer: Wallet;
    private bot: ethers.Contract;
    private chainId?: number;
    private flashbots?: FlashbotsBundleProvider;

    constructor(
        privateKey: string,
        signingKey: string,
        httpsUrl: string,
        botAddress: string
    ) {
        this.provider = new ethers.providers.JsonRpcProvider(httpsUrl);
        this.sender = new Wallet(privateKey, this.provider);
        this.signer = new Wallet(signingKey, this.provider);
        this.bot = new ethers.Contract(botAddress, BOT_ABI, this.provider);

        this.setup();
    }

    async setup(): Promise<void> {
        this.chainId = (await this.provider.getNetwork()).chainId;
        this.flashbots = await FlashbotsBundleProvider.create(
            this.provider,
            this.signer,
            PRIVATE_RELAY
        );
    }

    async toBundle(transaction: ethers.providers.TransactionRequest) {
        return [
            {
                signer: this.sender,
                transaction
            }
        ];
    }

    async sendBundle(bundle: any, blockNumber: number) {
        const replacementUuid = uuid.v4();
        const signedBundle = await this.flashbots!.signBundle(bundle);
        const targetBlock = blockNumber + 1;
        const simulation = await this.flashbots!.simulate(signedBundle, blockNumber);

        if ('error' in simulation) {
            console.warn(`Simulation Error: ${simulation.error.message}`);
            return '';
        } else {
            console.log(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`);
        }

        const bundleSubmission = await this.flashbots!.sendRawBundle(signedBundle, targetBlock, { replacementUuid });

        if ('error' in bundleSubmission) {
            throw new Error(bundleSubmission.error.message);
        }

        return [replacementUuid, bundleSubmission];
    }

    async cancelBundle(replacementUuid: string) {
        return await this.flashbots!.cancelBundles(replacementUuid);
    }

    async waitBundle(bundleSubmission: any) {
        return await bundleSubmission.wait();
    }

    async sendTx(transaction: ethers.providers.TransactionRequest) {
        const tx = await this.sender.sendTransaction(transaction);
        return tx.hash;
    }

    async _common_fields() {
        let nonce = await this.provider.getTransactionCount(this.sender.address);
        return {
            type: 2,
            chainId: this.chainId,
            nonce,
            from: this.sender.address
        };
    }

    async transferInTx(amountIn: bigint, maxPriorityFeePerGas: bigint, maxFeePerGas: bigint) {
        return {
            ...(await this._common_fields()),
            to: this.bot.address,
            value: amountIn,
            gasLimit: BigInt(60000),
            maxFeePerGas,
            maxPriorityFeePerGas
        };
    }

    async transferOutTx(token: string, maxPriorityFeePerGas: bigint, maxFeePerGas: bigint) {
        const calldata = this.bot.interface.encodeFunctionData('recoverToken', [token]);
        return {
            ...(await this._common_fields()),
            to: this.bot.address,
            data: calldata,
            value: BigInt(0),
            gasLimit: BigInt(50000),
            maxFeePerGas,
            maxPriorityFeePerGas
        };
    }

    async approveTx(router: string, tokens: string[], force: boolean, maxPriorityFeePerGas: bigint, maxFeePerGas: bigint) {
        const calldata = this.bot.interface.encodeFunctionData('approveRouter', [router, tokens, force]);
        return {
            ...(await this._common_fields()),
            to: this.bot.address,
            data: calldata,
            value: BigInt(0),
            gasLimit: BigInt(55000) * BigInt(tokens.length),
            maxFeePerGas,
            maxPriorityFeePerGas
        };
    }

    async orderTx(paths: Path[], amountIn: bigint, flashloan: Flashloan, loanFrom: string, maxPriorityFeePerGas: bigint, maxFeePerGas: bigint) {
        const nhop = paths.length;
        let calldataTypes = ['uint', 'uint', 'address'];
        let calldataRaw = [amountIn, flashloan, loanFrom];

        for (let i = 0; i < nhop; i++) {
            calldataTypes = calldataTypes.concat(['address', 'address', 'address']);
            calldataRaw = calldataRaw.concat(paths[i].toList());
        }

        const abiCoder = new ethers.utils.AbiCoder();
        const calldata = abiCoder.encode(calldataTypes, calldataRaw);

        return {
            ...(await this._common_fields()),
            to: this.bot.address,
            data: calldata,
            value: BigInt(0),
            gasLimit: BigInt(600000),
            maxFeePerGas,
            maxPriorityFeePerGas
        };
    }
}

export {
    Bundler,
    Path,
    Flashloan
};
