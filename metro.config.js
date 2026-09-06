const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const EMPTY = path.resolve(__dirname, 'src/chain/shims/empty.js');

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Mobile Wallet Adapter is unused on web; stub it so metro does not chase
  // its native-only dependency chain.
  if (moduleName.startsWith('@solana-mobile/')) {
    return { type: 'sourceFile', filePath: EMPTY };
  }
  return (originalResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

// Node core shims that @solana/web3.js and its deps reach for.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer'),
};

module.exports = config;
