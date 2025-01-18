# Demo on Local Chain

## Installation
```
npm ci
npm install hardhat
```

## Start a new node
```
npx hardhat node
```

## Run tests on local node
```
npx hardhat test --network localhost
```

## View transactions
Open up explorer.html to view. This verifies that setup is working.

## Running the Demo
1. Restart Hardhat node for a clean test:
```bash
npx hardhat node
```

2. Run the demo tests:
```bash
npx hardhat test demo/deployVilla.test.ts --network localhost
```
