import { encodeFunctionData, parseEther, createPublicClient, http , parseAbi , getContract , formatUnits} from 'viem'
import { ethers } from 'ethers'
import { mainnet } from 'viem/chains'
import UniswapV2PairAbi from '../abi/UniswapV2Pair.json';
import { MULTICALL_CONTRACT, UNISWAPV2PAIR_ABI , FEE_TIERS, UNISWAP_3FACTORY, DAI_ADDRESS, USDC_ADDRESS } from './constants';

interface Reserves {
    [address: string]: [BigInt, BigInt];
}

async function getUniswapV2Reserves(httpsUrl: string, poolAddresses: string[]): Promise<Reserves> {

    console.log('Starting getUniswapV2Reserves function...');

    const client = createPublicClient({
        chain: mainnet,
        transport: http(httpsUrl)
    });

    console.log('Client created.');

    const calls = poolAddresses.map((address) => {
        return {
        address: String(address),
        abi: parseAbi(UNISWAPV2PAIR_ABI),
        functionName: 'getReserves',
        } as const;
    });

/*
    const data = encodeFunctionData({ 
      abi: parseAbi(UNISWAPV2PAIR_ABI),
      functionName: 'getReserves',
    })

    for (const address of poolAddresses) {
        console.log(`Processing address: ${address}`);

        const call = {
            address: address,
            abi: parseAbi(UNISWAPV2PAIR_ABI),
            calldata: data
        };

        calls.push(call);
    }
*/

    console.log(`Prepared ${calls.length} calls.`);
    console.log(`Prepared ${calls[0].address} address.`);
/*
    for (const call of calls) {
        console.log(`Call address ${call.address}`);
    }
*/
    // Execute the multicall
    console.log('Executing multicall...');
    const results = await client.multicall({
        contracts: calls,
        allowFailure: true // Since the original code had allowFailure set to true
    });

    console.log('Multicall executed. Processing results...');

    let successfulCalls = 0;
    let failedCalls = 0;

    let reserves: Reserves = {};
    for (let i = 0; i < results.length; i++) {
        let response = results[i];
        if (response.status === 'success') {
            successfulCalls++;
            // Assuming the result returns the reserves in the order [reserve0, reserve1]
            reserves[poolAddresses[i]] = [BigInt(response.result[0]), BigInt(response.result[1])];
        } else {
            failedCalls++;
            console.warn(`Call to address ${poolAddresses[i]} failed with message: ${response.error?.message}`);
        }
    }

    console.log(`Processed results. Successful calls: ${successfulCalls}, Failed calls: ${failedCalls}`);

    return reserves;
}


async function example1(httpsUrl: string) {

    const client = createPublicClient({
        chain: mainnet,
        transport: http(httpsUrl)
    });
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

async function batchGetUniswapV2Reserves(httpsUrl: string, poolAddresses: string[]): Promise<Reserves> {
    let poolsCnt = poolAddresses.length;
    let batch = Math.ceil(poolsCnt / 200);
    let poolsPerBatch = Math.ceil(poolsCnt / batch);

    let promises = [];

    for (let i = 0; i < batch; i++) {
        let startIdx = i * poolsPerBatch;
        let endIdx = Math.min(startIdx + poolsPerBatch, poolsCnt);
        promises.push(
            getUniswapV2Reserves(httpsUrl, poolAddresses.slice(startIdx, endIdx))
        );
    }

    const results = await Promise.all(promises);
    const reserves = Object.assign(...results);
    return reserves;
}

export {
    getUniswapV2Reserves,
    batchGetUniswapV2Reserves,
    example1,
};
