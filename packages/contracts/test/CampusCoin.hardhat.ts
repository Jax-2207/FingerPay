import { expect } from 'chai';
import '@nomicfoundation/hardhat-ethers';
import { ethers } from 'hardhat';

describe('CampusCoin', function () {
  async function deploy() {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const controller = signers[1];
    const other = signers[2];
    const recipient = signers[3];
    if (
      deployer === undefined ||
      controller === undefined ||
      other === undefined ||
      recipient === undefined
    ) {
      throw new Error('CampusCoin tests require four local signers');
    }
    const factory = await ethers.getContractFactory('CampusCoin');
    const token = await factory.deploy();
    await token.waitForDeployment();
    return { token, deployer, controller, other, recipient };
  }

  it('uses the CPC identity and zero decimals', async function () {
    const { token } = await deploy();
    expect(await token.name()).to.equal('CampusCoin');
    expect(await token.symbol()).to.equal('CPC');
    expect(await token.decimals()).to.equal(0);
  });

  it('lets only its deployer set the controller once', async function () {
    const { token, deployer, controller, other } = await deploy();
    await expect(token.connect(other).setController(other.address)).to.be.revertedWithCustomError(
      token,
      'NotController',
    );
    await expect(token.connect(deployer).setController(controller.address)).not.to.be.reverted;
    await expect(token.connect(deployer).setController(other.address)).to.be.reverted;
    expect(await token.controller()).to.equal(controller.address);
  });

  it('allows the controller to mint, transfer, and burn CPC', async function () {
    const { token, controller, recipient, other } = await deploy();
    await token.setController(controller.address);
    await expect(token.connect(controller).controllerMint(recipient.address, 12n))
      .to.emit(token, 'Transfer')
      .withArgs(ethers.ZeroAddress, recipient.address, 12n);
    await expect(token.connect(controller).controllerTransfer(recipient.address, other.address, 5n))
      .to.emit(token, 'Transfer')
      .withArgs(recipient.address, other.address, 5n);
    await expect(token.connect(controller).controllerBurn(other.address, 2n))
      .to.emit(token, 'Transfer')
      .withArgs(other.address, ethers.ZeroAddress, 2n);
    expect(await token.balanceOf(recipient.address)).to.equal(7n);
    expect(await token.balanceOf(other.address)).to.equal(3n);
    expect(await token.totalSupply()).to.equal(10n);
  });

  it('rejects controller operations from every other caller', async function () {
    const { token, controller, other, recipient } = await deploy();
    await token.setController(controller.address);
    await expect(
      token.connect(other).controllerMint(recipient.address, 1n),
    ).to.be.revertedWithCustomError(token, 'NotController');
    await expect(
      token.connect(other).controllerTransfer(other.address, recipient.address, 1n),
    ).to.be.revertedWithCustomError(token, 'NotController');
    await expect(
      token.connect(other).controllerBurn(other.address, 1n),
    ).to.be.revertedWithCustomError(token, 'NotController');
  });

  it('always disables the public ERC20 transfer and approval entry points', async function () {
    const { token, controller, recipient, other } = await deploy();
    await token.setController(controller.address);
    await token.connect(controller).controllerMint(recipient.address, 3n);
    await expect(
      token.connect(recipient).transfer(other.address, 1n),
    ).to.be.revertedWithCustomError(token, 'TransfersDisabled');
    await expect(
      token.connect(recipient).transfer(other.address, 0n),
    ).to.be.revertedWithCustomError(token, 'TransfersDisabled');
    await expect(
      token.connect(other).transferFrom(recipient.address, other.address, 1n),
    ).to.be.revertedWithCustomError(token, 'TransfersDisabled');
    await expect(
      token.connect(other).transferFrom(recipient.address, other.address, 0n),
    ).to.be.revertedWithCustomError(token, 'TransfersDisabled');
    await expect(token.connect(recipient).approve(other.address, 1n)).to.be.revertedWithCustomError(
      token,
      'TransfersDisabled',
    );
    await expect(token.connect(recipient).approve(other.address, 0n)).to.be.revertedWithCustomError(
      token,
      'TransfersDisabled',
    );
  });
});
