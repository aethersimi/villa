import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('VILLA Token Deployment', function () {
  async function deployVillaFixture() {
    const [deployer, tokenIssuer, tokenAgent] = await ethers.getSigners();

    // Import and run the deployVilla script
    const deployVilla = require('./deployVilla');
    const result = await deployVilla.main();

    return { 
      token: result.token,
      tokenIssuer
    };
  }

  it('Should deploy VILLA token with correct parameters', async function () {
    const { token } = await loadFixture(deployVillaFixture);

    // Verify token is deployed
    expect(token.address).to.be.properAddress;
    
    // Verify token parameters
    expect(await token.name()).to.equal('Villa Tokens');
    expect(await token.symbol()).to.equal('VILLA');
    expect(await token.decimals()).to.equal(0);
    expect(await token.totalSupply()).to.equal(ethers.utils.parseUnits('1000000', 0));
  });

  it('Should mint initial supply to token issuer', async function () {
    const { token, tokenIssuer } = await loadFixture(deployVillaFixture);
    
    const totalSupply = ethers.utils.parseUnits('1000000', 0);
    expect(await token.balanceOf(tokenIssuer.address)).to.equal(totalSupply);
  });

  it('Should be unpaused after deployment', async function () {
    const { token } = await loadFixture(deployVillaFixture);
    
    expect(await token.paused()).to.be.false;
  });
});
