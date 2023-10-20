import { addColors, createLogger, format, transports } from 'winston';
import * as dotenv from 'dotenv';
import { parseAbi } from 'viem';
import * as UniswapV2FactoryAbi from '../abi/UniswapV2Factory.json'

dotenv.config();

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'black',
    http: 'magenta',
    debug: 'blue',
};

addColors(colors);

const logFormat = format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}] ${message}`;
});

export const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        logFormat,
        format.colorize({ all: true }),
    ),
    transports: [new transports.Console()],
});

export const blacklistTokens: string[] = ['0x9469603F3Efbcf17e4A5868d81C701BDbD222555'];

export const MULTICALL_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const MULTICALL_ABI = [
  // https://github.com/mds1/multicall
  'struct Call { address target; bytes callData; }',
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Call3Value { address target; bool allowFailure; uint256 value; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate(Call[] calldata calls) public payable returns (uint256 blockNumber, bytes[] memory returnData)',
  'function tryAggregate(bool requireSuccess, Call[] calldata calls) public payable returns (Result[] memory returnData)',
  'function tryBlockAndAggregate(bool requireSuccess, Call[] calldata calls) public payable returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)',
  'function blockAndAggregate(Call[] calldata calls) public payable returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)',
  'function aggregate3(Call3[] calldata calls) public payable returns (Result[] memory returnData)',
  'function aggregate3Value(Call3Value[] calldata calls) public payable returns (Result[] memory returnData)',
  'function getBasefee() view returns (uint256 basefee)',
  'function getBlockHash(uint256 blockNumber) view returns (bytes32 blockHash)',
  'function getBlockNumber() view returns (uint256 blockNumber)',
  'function getChainId() view returns (uint256 chainid)',
  'function getCurrentBlockCoinbase() view returns (address coinbase)',
  'function getCurrentBlockDifficulty() view returns (uint256 difficulty)',
  'function getCurrentBlockGasLimit() view returns (uint256 gaslimit)',
  'function getCurrentBlockTimestamp() view returns (uint256 timestamp)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
  'function getLastBlockHash() view returns (bytes32 blockHash)',
] as const;

export const MULTICALL_CONTRACT = {
  address: MULTICALL_ADDRESS,
  abi: parseAbi(MULTICALL_ABI),
} as const;

export const UNISWAPV2PAIR_ADDRESS = '0x7885e359a085372EbCF1ed6829402f149D02c600';

export const UNISWAPV2PAIR_ABI = [
    "constructor()", "event Approval(address indexed owner, address indexed spender, uint256 value)",
     "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
     "event Mint(address indexed sender, uint256 amount0, uint256 amount1)", "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
     "event Sync(uint112 reserve0, uint112 reserve1)", "event Transfer(address indexed from, address indexed to, uint256 value)",
     "function DOMAIN_SEPARATOR() view returns (bytes32)", "function MINIMUM_LIQUIDITY() view returns (uint256)",
     "function PERMIT_TYPEHASH() view returns (bytes32)", "function allowance(address, address) view returns (uint256)",
     "function approve(address spender, uint256 value) returns (bool)", "function balanceOf(address) view returns (uint256)",
     "function burn(address to) returns (uint256 amount0, uint256 amount1)", "function decimals() view returns (uint8)",
     "function factory() view returns (address)", "function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
     "function initialize(address _token0, address _token1)", "function kLast() view returns (uint256)",
     "function mint(address to) returns (uint256 liquidity)", "function name() view returns (string)",
     "function nonces(address) view returns (uint256)", "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
     "function price0CumulativeLast() view returns (uint256)", "function price1CumulativeLast() view returns (uint256)",
     "function skim(address to)", "function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data)",
     "function symbol() view returns (string)", "function sync()", "function token0() view returns (address)",
     "function token1() view returns (address)", "function totalSupply() view returns (uint256)",
     "function transfer(address to, uint256 value) returns (bool)", "function transferFrom(address from, address to, uint256 value) returns (bool)"
] as const;
export const UNISWAPV2PAIR_CONTRACT = {
  address: UNISWAPV2PAIR_ADDRESS,
  abi: parseAbi(UNISWAPV2PAIR_ABI),
} as const;

// Common variables used throughout
export const SUSHI_FACTORY = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';

export const Erc20Abi = [
    'function decimals() external view returns (uint8)'
] as const;

export const V2FactoryAbi = [
    'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
] as const;

export const UNISWAP_2FACTORY_ABI = [
    "constructor()",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
    "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
    "event Sync(uint112 reserve0, uint112 reserve1)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function MINIMUM_LIQUIDITY() view returns (uint256)",
    "function PERMIT_TYPEHASH() view returns (bytes32)",
    "function allowance(address, address) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function burn(address to) returns (uint256 amount0, uint256 amount1)",
    "function decimals() view returns (uint8)",
    "function factory() view returns (address)",
    "function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
    "function initialize(address _token0, address _token1)",
    "function kLast() view returns (uint256)",
    "function mint(address to) returns (uint256 liquidity)",
    "function name() view returns (string)",
    "function nonces(address) view returns (uint256)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function price0CumulativeLast() view returns (uint256)",
    "function price1CumulativeLast() view returns (uint256)",
    "function skim(address to)",
    "function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data)",
    "function symbol() view returns (string)",
    "function sync()",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
    ]

// Uniswap V2 constants.
export const UNISWAP_2FACTORY = {
  address: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  abi: parseAbi(V2FactoryAbi),
} as const;
// Uniswap V3 constants.
export const FEE_TIERS = [100, 500, 3000, 10000];
export const UNISWAP_3FACTORY = {
  address: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  abi: parseAbi([
    'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
  ]),
} as const;

export const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

export const HTTPS_URL = process.env.HTTPS_URL;
export const WSS_URL = process.env.WSS_URL;
export const CHAIN_ID = process.env.CHAIN_ID || 1;
export const BLOCKNATIVE_TOKEN = process.env.BLOCKNATIVE_TOKEN;
export const PRIVATE_KEY = process.env.PRIVATE_KEY;
export const SIGNING_KEY = process.env.SIGNING_KEY;
export const BOT_ADDRESS = process.env.BOT_ADDRESS;
export const BOT_ABI = require('../abi/V2ArbBot.json'); // Consider using import instead of require for TypeScript
export const CACHED_POOLS_FILE = '.cached-pools.csv';
export const PRIVATE_RELAY = 'https://relay.flashbots.net';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';