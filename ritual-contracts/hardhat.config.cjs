/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    ritualTestnet: {
      url: "https://rpc.ritualfoundation.org",
      // Приватный ключ кошелька
      accounts: ["d270ffa001aea4a04004509a5c7d553321301704e8947547677b5827a76f817d"],
    },
  },
};