import { ethers } from 'hardhat';
import { Signer } from 'ethers';
import OnchainID from '@onchain-id/solidity';

// Deploys an Identity Proxy contract that implements ERC734/735 identity management
// This is a core component of ERC3643's identity verification system
async function deployIdentityProxy(implementationAuthority: string, managementKey: string, signer: Signer) {
  const identity = await new ethers.ContractFactory(
    OnchainID.contracts.IdentityProxy.abi, 
    OnchainID.contracts.IdentityProxy.bytecode, 
    signer
  ).deploy(implementationAuthority, managementKey);

  return ethers.getContractAt('Identity', identity.address, signer);
}

// Main deployment function for the VILLA token using TREX framework
// Implements ERC3643 compliant token with identity verification and compliance checks
export async function main() {
  // Get signers representing different roles in the system:
  // - deployer: The account deploying the contracts
  // - tokenIssuer: The entity issuing the VILLA tokens
  // - tokenAgent: The compliance officer managing token operations
  // - tokenAdmin: The administrator managing agent permissions
  const [deployer, tokenIssuer, tokenAgent, tokenAdmin] = await ethers.getSigners();

  // Deploy core implementations required for ERC3643 compliance:
  // - ClaimTopicsRegistry: Manages valid claim types for identity verification
  // - TrustedIssuersRegistry: Manages trusted entities that can issue claims
  // - IdentityRegistryStorage: Stores identity data for token holders
  // - IdentityRegistry: Manages identity verification and linking to tokens
  // - ModularCompliance: Handles compliance rules and restrictions
  // - Token: The base implementation of the ERC3643 token
  const claimTopicsRegistryImplementation = await ethers.deployContract('ClaimTopicsRegistry', deployer);
  const trustedIssuersRegistryImplementation = await ethers.deployContract('TrustedIssuersRegistry', deployer);
  const identityRegistryStorageImplementation = await ethers.deployContract('IdentityRegistryStorage', deployer);
  const identityRegistryImplementation = await ethers.deployContract('IdentityRegistry', deployer);
  const modularComplianceImplementation = await ethers.deployContract('ModularCompliance', deployer);
  const tokenImplementation = await ethers.deployContract('Token', deployer);
  
  // Deploy OnchainID implementation for decentralized identity management
  const identityImplementation = await new ethers.ContractFactory(
    OnchainID.contracts.Identity.abi,
    OnchainID.contracts.Identity.bytecode,
    deployer,
  ).deploy(deployer.address, true);

  // Deploy implementation authority that manages upgradeable contracts
  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer,
  ).deploy(identityImplementation.address);

  // Deploy TREX implementation authority that manages versioning of TREX contracts
  const trexImplementationAuthority = await ethers.deployContract(
    'TREXImplementationAuthority',
    [true, ethers.constants.AddressZero, ethers.constants.AddressZero],
    deployer,
  );

  // Define version structure for TREX implementation (v4.0.0)
  const versionStruct = {
    major: 4,
    minor: 0,
    patch: 0,
  };
  
  // Define contract implementations for this version
  const contractsStruct = {
    tokenImplementation: tokenImplementation.address,
    ctrImplementation: claimTopicsRegistryImplementation.address,
    irImplementation: identityRegistryImplementation.address,
    irsImplementation: identityRegistryStorageImplementation.address,
    tirImplementation: trustedIssuersRegistryImplementation.address,
    mcImplementation: modularComplianceImplementation.address,
  };
  
  // Register and activate this TREX version
  await trexImplementationAuthority.connect(deployer).addAndUseTREXVersion(versionStruct, contractsStruct);

  // Deploy identity factory for creating new identity contracts
  const identityFactory = await new ethers.ContractFactory(
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    deployer
  ).deploy(identityImplementationAuthority.address);

  // Deploy TREX factory that will create the VILLA token
  const trexFactory = await ethers.deployContract(
    'TREXFactory',
    [trexImplementationAuthority.address, identityFactory.address],
    deployer
  );
  
  // Link identity factory to TREX factory
  await identityFactory.connect(deployer).addTokenFactory(trexFactory.address);

  // Deploy OnchainID proxy for the VILLA token issuer
  const tokenOID = await deployIdentityProxy(identityImplementationAuthority.address, tokenIssuer.address, deployer);

  // Define VILLA token parameters
  const tokenName = 'Villa Tokens';
  const tokenSymbol = 'VILLA';
  const tokenDecimals = 0; // Non-divisible tokens
  const totalSupply = ethers.utils.parseUnits('1000000', tokenDecimals); // 1 million tokens

  // Deploy and configure core registries for identity management:
  // - ClaimTopicsRegistry: Manages valid claim types
  const claimTopicsRegistry = await ethers
    .deployContract('ClaimTopicsRegistryProxy', [trexImplementationAuthority.address], deployer)
    .then(async (proxy) => ethers.getContractAt('ClaimTopicsRegistry', proxy.address));

  // - TrustedIssuersRegistry: Manages trusted claim issuers
  const trustedIssuersRegistry = await ethers
    .deployContract('TrustedIssuersRegistryProxy', [trexImplementationAuthority.address], deployer)
    .then(async (proxy) => ethers.getContractAt('TrustedIssuersRegistry', proxy.address));

  // - IdentityRegistryStorage: Stores identity data
  const identityRegistryStorage = await ethers
    .deployContract('IdentityRegistryStorageProxy', [trexImplementationAuthority.address], deployer)
    .then(async (proxy) => ethers.getContractAt('IdentityRegistryStorage', proxy.address));

  // Deploy default compliance module that enforces basic transfer rules
  const defaultCompliance = await ethers.deployContract('DefaultCompliance', deployer);

  // Deploy identity registry that links token holders to their verified identities
  const identityRegistry = await ethers
    .deployContract(
      'IdentityRegistryProxy',
      [trexImplementationAuthority.address, trustedIssuersRegistry.address, claimTopicsRegistry.address, identityRegistryStorage.address],
      deployer,
    )
    .then(async (proxy) => ethers.getContractAt('IdentityRegistry', proxy.address));

  // Bind identity registry to its storage contract
  await identityRegistryStorage.connect(deployer).bindIdentityRegistry(identityRegistry.address);

  // Deploy VILLA token proxy with ERC3643 compliance features:
  // - Links to identity registry for KYC/AML checks
  // - Uses default compliance module for transfer rules
  // - Has associated OnchainID for issuer identity
  const token = await ethers
    .deployContract(
      'TokenProxy',
      [
        trexImplementationAuthority.address,
        identityRegistry.address,
        defaultCompliance.address,
        tokenName,
        tokenSymbol,
        tokenDecimals,
        tokenOID.address,
      ],
      deployer,
    )
    .then(async (proxy) => ethers.getContractAt('Token', proxy.address));

  // Configure token agent permissions:
  // - Add token agent to token contract for compliance operations
  // - Add token agent to identity registry for identity management
  // - Add token contract as agent to identity registry for automatic checks
  await token.connect(deployer).addAgent(tokenAgent.address);
  await identityRegistry.connect(deployer).addAgent(tokenAgent.address);
  await identityRegistry.connect(deployer).addAgent(token.address);

  // Define and register claim topics for identity verification
  const claimTopics = [ethers.utils.id('CLAIM_TOPIC')];
  await claimTopicsRegistry.connect(deployer).addClaimTopic(claimTopics[0]);

  // Deploy and configure AgentManager for managing agent permissions:
  // - AgentManager acts as a permission layer between agents and contracts
  // - Allows for hierarchical agent management with admin roles
  const agentManager = await ethers.deployContract('AgentManager', [token.address], tokenAgent);
  await agentManager.connect(tokenAgent).addAgentAdmin(tokenAdmin.address);
  await token.connect(deployer).addAgent(agentManager.address);
  await identityRegistry.connect(deployer).addAgent(agentManager.address);

  // Register token issuer's identity in the identity registry
  console.log('Registering token issuer identity...');
  await identityRegistry.connect(tokenAgent).registerIdentity(tokenIssuer.address, tokenOID.address, 0);

  // Set up claim issuer for identity verification:
  // - Create signing key for claim issuer
  // - Deploy claim issuer contract
  // - Define claim topic and data
  console.log('Setting up claim issuer...');
  const claimIssuerSigningKey = ethers.Wallet.createRandom();
  const claimIssuerContract = await ethers.deployContract('ClaimIssuer', [deployer.address], deployer);
  const claimTopic = ethers.utils.id('CLAIM_TOPIC');
  const claimData = ethers.utils.hexlify(ethers.utils.toUtf8Bytes('Verified'));
  
  // Add signing key to claim issuer with CLAIM type and ECDSA signature
  await claimIssuerContract.connect(deployer).addKey(
    ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [claimIssuerSigningKey.address])),
    3, // CLAIM key
    1  // ECDSA signature type
  );

  // Register claim issuer as a trusted entity in the registry
  console.log('Adding trusted issuer...');
  await trustedIssuersRegistry.connect(deployer).addTrustedIssuer(claimIssuerContract.address, [claimTopic]);

  console.log('Creating claim...');
  const claim = {
    data: claimData,
    issuer: claimIssuerContract.address,
    topic: claimTopic,
    scheme: 1,
    identity: tokenOID.address,
    signature: ''
  };

  claim.signature = await claimIssuerSigningKey.signMessage(
    ethers.utils.arrayify(
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [claim.identity, claim.topic, claim.data]
        )
      )
    )
  );

  console.log('Adding claim to token issuer identity...');
  await tokenOID.connect(tokenIssuer).addClaim(
    claim.topic,
    claim.scheme,
    claim.issuer,
    claim.signature,
    claim.data,
    ''
  );

  console.log('Minting initial supply...');
  await token.connect(tokenAgent).mint(tokenIssuer.address, totalSupply);

  console.log('Unpausing token...');
  await token.connect(tokenAgent).unpause();

  console.log(`VILLA token deployed to: ${token.address}`);
  console.log(`Initial supply of ${totalSupply.toString()} VILLA tokens minted to ${tokenIssuer.address}`);
  
  return { 
    token,
    tokenOID,
    identityRegistry,
    defaultCompliance,
    claimTopicsRegistry,
    trustedIssuersRegistry,
    identityRegistryStorage,
    agentManager,
    factories: {
      trexFactory,
      identityFactory
    },
    authorities: {
      trexImplementationAuthority,
      identityImplementationAuthority
    },
    implementations: {
      identityImplementation,
      claimTopicsRegistryImplementation,
      trustedIssuersRegistryImplementation,
      identityRegistryStorageImplementation,
      identityRegistryImplementation,
      modularComplianceImplementation,
      tokenImplementation
    }
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
