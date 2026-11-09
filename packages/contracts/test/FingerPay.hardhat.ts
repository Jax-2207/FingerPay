import { expect } from 'chai';
import '@nomicfoundation/hardhat-ethers';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('FingerPay', function () {
  async function deploy() {
    const signers = await ethers.getSigners();
    const admin = signers[0];
    const relayer = signers[1];
    const user = signers[2];
    const merchant = signers[3];
    const other = signers[4];
    if (
      admin === undefined ||
      relayer === undefined ||
      user === undefined ||
      merchant === undefined ||
      other === undefined
    ) {
      throw new Error('FingerPay tests require five local signers');
    }
    const token = await (await ethers.getContractFactory('CampusCoin')).deploy();
    await token.waitForDeployment();
    const app = await (
      await ethers.getContractFactory('FingerPay')
    ).deploy(await token.getAddress());
    await app.waitForDeployment();
    await token.setController(await app.getAddress());
    const relayerRole = await app.RELAYER_ROLE();
    await app.grantRole(relayerRole, relayer.address);
    return { app, token, admin, relayer, user, merchant, other, relayerRole };
  }

  async function expiryAfter(seconds = 600): Promise<bigint> {
    const block = await ethers.provider.getBlock('latest');
    if (block === null) throw new Error('Latest block was unavailable');
    return BigInt(block.timestamp + seconds);
  }

  async function register(app: Awaited<ReturnType<typeof deploy>>['app'], address: string) {
    await app.registerMerchant(address, ethers.ZeroHash);
  }

  it('restricts merchant administration to Campus Accounts and emits indexed registration data', async function () {
    const { app, admin, relayer, merchant } = await deploy();
    const metaHash = ethers.id('merchant metadata');
    await expect(
      app.connect(relayer).registerMerchant(merchant.address, metaHash),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
    await expect(app.registerMerchant(merchant.address, metaHash))
      .to.emit(app, 'MerchantRegistered')
      .withArgs(merchant.address, metaHash);
    expect(await app.merchantActive(merchant.address)).to.equal(true);
    expect(await app.merchantRegistered(merchant.address)).to.equal(true);
    await expect(
      app.connect(relayer).deactivateMerchant(merchant.address),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
    await expect(app.deactivateMerchant(merchant.address))
      .to.emit(app, 'MerchantDeactivated')
      .withArgs(merchant.address);
    expect(await app.merchantActive(merchant.address)).to.equal(false);
    expect(await app.hasRole(await app.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
  });

  it('keeps relayer and admin authority separate and supports role grants and revocations', async function () {
    const { app, admin, relayer, other, user, merchant, relayerRole } = await deploy();
    const expiry = await expiryAfter();
    await expect(
      app.connect(admin).pay(user.address, merchant.address, 1n, ethers.id('a'), expiry),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
    await expect(
      app.connect(relayer).registerMerchant(merchant.address, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
    await app.grantRole(relayerRole, other.address);
    expect(await app.hasRole(relayerRole, other.address)).to.equal(true);
    await register(app, merchant.address);
    await app.mint(user.address, 2n, ethers.id('grant-test'));
    await app.connect(other).pay(user.address, merchant.address, 1n, ethers.id('b'), expiry);
    await app.revokeRole(relayerRole, other.address);
    expect(await app.hasRole(relayerRole, other.address)).to.equal(false);
    await expect(
      app.connect(other).pay(user.address, merchant.address, 1n, ethers.id('c'), expiry),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
  });

  it('mints positive CPC, rejects zero-value mint, and gates mint and pay while paused', async function () {
    const { app, token, relayer, user, merchant } = await deploy();
    const receiptRef = ethers.id('mint receipt');
    await expect(app.mint(user.address, 4n, receiptRef))
      .to.emit(app, 'Minted')
      .withArgs(user.address, 4n, receiptRef);
    const supplyBeforeZeroMint = await token.totalSupply();
    const balanceBeforeZeroMint = await token.balanceOf(user.address);
    const mintedEventsBeforeZeroMint = await app.queryFilter(app.filters.Minted(), 0, 'latest');
    await expect(app.mint(user.address, 0n, ethers.ZeroHash)).to.be.revertedWithCustomError(
      app,
      'ZeroAmount',
    );
    const mintedEventsAfterZeroMint = await app.queryFilter(app.filters.Minted(), 0, 'latest');
    expect(await token.totalSupply()).to.equal(supplyBeforeZeroMint);
    expect(await token.balanceOf(user.address)).to.equal(balanceBeforeZeroMint);
    expect(mintedEventsAfterZeroMint).to.have.length(mintedEventsBeforeZeroMint.length);
    await register(app, merchant.address);
    await app.pause();
    await expect(app.mint(user.address, 1n, ethers.ZeroHash)).to.be.revertedWithCustomError(
      app,
      'EnforcedPause',
    );
    await expect(app.connect(relayer).pause()).to.be.revertedWithCustomError(
      app,
      'AccessControlUnauthorizedAccount',
    );
    await expect(
      app
        .connect(relayer)
        .pay(user.address, merchant.address, 1n, ethers.id('paused'), await expiryAfter()),
    ).to.be.revertedWithCustomError(app, 'EnforcedPause');
    await expect(app.connect(relayer).unpause()).to.be.revertedWithCustomError(
      app,
      'AccessControlUnauthorizedAccount',
    );
    await app.unpause();
    await expect(
      app.connect(relayer).mint(user.address, 1n, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
  });

  it('computes the specified chain and contract bound intent hash', async function () {
    const { app, merchant } = await deploy();
    const amount = 9n;
    const nonce = ethers.id('intent nonce');
    const expiry = await expiryAfter();
    const network = await ethers.provider.getNetwork();
    const signers = await ethers.getSigners();
    const alternateMerchant = signers[5];
    if (alternateMerchant === undefined) throw new Error('Missing alternate merchant signer');
    const tokenAddress = await (await ethers.getContractFactory('CampusCoin')).deploy();
    await tokenAddress.waitForDeployment();
    const alternateApp = await (
      await ethers.getContractFactory('FingerPay')
    ).deploy(await tokenAddress.getAddress());
    await alternateApp.waitForDeployment();
    const contractAddress = await app.getAddress();
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'bytes32', 'uint64'],
        [network.chainId, contractAddress, merchant.address, amount, nonce, expiry],
      ),
    );
    const intentId = await app.computeIntentId(merchant.address, amount, nonce, expiry);
    expect(intentId).to.equal(expected);
    expect(
      await app.computeIntentId(alternateMerchant.address, amount, nonce, expiry),
    ).not.to.equal(intentId);
    expect(await app.computeIntentId(merchant.address, amount + 1n, nonce, expiry)).not.to.equal(
      intentId,
    );
    expect(
      await app.computeIntentId(merchant.address, amount, ethers.id('different nonce'), expiry),
    ).not.to.equal(intentId);
    expect(await app.computeIntentId(merchant.address, amount, nonce, expiry + 1n)).not.to.equal(
      intentId,
    );
    expect(
      await alternateApp.computeIntentId(merchant.address, amount, nonce, expiry),
    ).not.to.equal(intentId);
    const alternateChainIdHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'bytes32', 'uint64'],
        [network.chainId + 1n, contractAddress, merchant.address, amount, nonce, expiry],
      ),
    );
    expect(alternateChainIdHash).not.to.equal(intentId);
  });

  it('pays an active merchant and stores the full payment record', async function () {
    const { app, token, relayer, user, merchant } = await deploy();
    const amount = 7n;
    const nonce = ethers.id('successful payment');
    const expiry = await expiryAfter();
    await register(app, merchant.address);
    await app.mint(user.address, amount, ethers.id('user mint'));
    const intentId = await app.computeIntentId(merchant.address, amount, nonce, expiry);
    await expect(app.connect(relayer).pay(user.address, merchant.address, amount, nonce, expiry))
      .to.emit(app, 'Payment')
      .withArgs(intentId, user.address, merchant.address, amount);
    expect(await token.balanceOf(user.address)).to.equal(0n);
    expect(await token.balanceOf(merchant.address)).to.equal(amount);
    expect(await app.intentUsed(intentId)).to.equal(true);
    const record = await app.payments(intentId);
    expect(record.user).to.equal(user.address);
    expect(record.merchant).to.equal(merchant.address);
    expect(record.amount).to.equal(amount);
    expect(record.refunded).to.equal(false);
  });

  it('rejects invalid payment arguments and keeps exact expiry equality valid', async function () {
    const { app, relayer, user, merchant, other } = await deploy();
    const expiry = await expiryAfter();
    await register(app, merchant.address);
    await app.mint(user.address, 10n, ethers.id('payment balance'));
    await expect(
      app.connect(relayer).pay(user.address, merchant.address, 0n, ethers.id('zero'), expiry),
    ).to.be.revertedWithCustomError(app, 'ZeroAmount');
    await expect(
      app.connect(relayer).pay(user.address, user.address, 1n, ethers.id('self'), expiry),
    ).to.be.revertedWithCustomError(app, 'SelfPayment');
    await expect(
      app.connect(relayer).pay(user.address, other.address, 1n, ethers.id('inactive'), expiry),
    ).to.be.revertedWithCustomError(app, 'MerchantNotActive');
    await time.setNextBlockTimestamp(Number(expiry));
    await expect(
      app
        .connect(relayer)
        .pay(user.address, merchant.address, 1n, ethers.id('equal expiry'), expiry),
    ).not.to.be.reverted;
  });

  it('rejects past, replayed, underfunded, and unauthorized payment attempts without unintended state changes', async function () {
    const { app, token, relayer, user, merchant, other } = await deploy();
    await register(app, merchant.address);
    await app.mint(user.address, 3n, ethers.id('limited balance'));
    const expired = await expiryAfter();
    await time.setNextBlockTimestamp(Number(expired + 1n));
    const expiredId = await app.computeIntentId(merchant.address, 1n, ethers.id('past'), expired);
    await expect(
      app.connect(relayer).pay(user.address, merchant.address, 1n, ethers.id('past'), expired),
    ).to.be.revertedWithCustomError(app, 'IntentExpired');
    expect(await app.intentUsed(expiredId)).to.equal(false);
    expect((await app.payments(expiredId)).user).to.equal(ethers.ZeroAddress);

    const liveExpiry = await expiryAfter();
    const replayNonce = ethers.id('replay');
    const replayId = await app.computeIntentId(merchant.address, 1n, replayNonce, liveExpiry);
    await app.connect(relayer).pay(user.address, merchant.address, 1n, replayNonce, liveExpiry);
    const userBalance = await token.balanceOf(user.address);
    const merchantBalance = await token.balanceOf(merchant.address);
    await expect(
      app.connect(relayer).pay(user.address, merchant.address, 1n, replayNonce, liveExpiry),
    ).to.be.revertedWithCustomError(app, 'IntentAlreadyUsed');
    await expect(
      app
        .connect(relayer)
        .pay(user.address, merchant.address, 5n, ethers.id('underfunded'), liveExpiry),
    ).to.be.revertedWithCustomError(app, 'InsufficientBalance');
    await expect(
      app
        .connect(other)
        .pay(user.address, merchant.address, 1n, ethers.id('unauthorized'), liveExpiry),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
    expect(await token.balanceOf(user.address)).to.equal(userBalance);
    expect(await token.balanceOf(merchant.address)).to.equal(merchantBalance);
    expect(await app.intentUsed(replayId)).to.equal(true);
    expect(
      await app.intentUsed(
        await app.computeIntentId(merchant.address, 5n, ethers.id('underfunded'), liveExpiry),
      ),
    ).to.equal(false);
  });

  it('refunds a payment once and rejects unknown, duplicate, underfunded, unauthorized, or paused refunds', async function () {
    const { app, token, admin, relayer, user, merchant, other } = await deploy();
    const amount = 5n;
    const nonce = ethers.id('refundable');
    const expiry = await expiryAfter();
    await register(app, merchant.address);
    await app.mint(user.address, amount, ethers.id('refund balance'));
    const intentId = await app.computeIntentId(merchant.address, amount, nonce, expiry);
    await app.connect(relayer).pay(user.address, merchant.address, amount, nonce, expiry);
    await expect(app.refund(ethers.id('unknown'))).to.be.revertedWithCustomError(
      app,
      'UnknownPayment',
    );
    await expect(app.connect(other).refund(intentId)).to.be.revertedWithCustomError(
      app,
      'AccessControlUnauthorizedAccount',
    );
    await expect(app.refund(intentId))
      .to.emit(app, 'Refunded')
      .withArgs(intentId, user.address, merchant.address, amount);
    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await token.balanceOf(merchant.address)).to.equal(0n);
    expect((await app.payments(intentId)).refunded).to.equal(true);
    await expect(app.refund(intentId)).to.be.revertedWithCustomError(app, 'AlreadyRefunded');

    const secondNonce = ethers.id('underfunded refund');
    const secondId = await app.computeIntentId(merchant.address, amount, secondNonce, expiry);
    await app.connect(relayer).pay(user.address, merchant.address, amount, secondNonce, expiry);
    await app
      .connect(admin)
      .settle(merchant.address, amount, ethers.id('consume merchant balance'));
    await expect(app.refund(secondId)).to.be.revertedWithCustomError(app, 'InsufficientBalance');
    expect((await app.payments(secondId)).refunded).to.equal(false);
    expect(await token.balanceOf(user.address)).to.equal(0n);
    expect(await token.balanceOf(merchant.address)).to.equal(0n);
    await app.pause();
    await expect(app.refund(secondId)).to.be.revertedWithCustomError(app, 'EnforcedPause');
  });

  it('burns positive settlement amounts for active and registered inactive merchants only', async function () {
    const { app, token, merchant, other, relayer } = await deploy();
    const ref = ethers.id('settlement');
    await register(app, merchant.address);
    await app.mint(merchant.address, 8n, ethers.id('merchant mint'));
    await expect(
      app.connect(relayer).settle(merchant.address, 1n, ethers.id('unauthorized settlement')),
    ).to.be.revertedWithCustomError(app, 'AccessControlUnauthorizedAccount');
    await expect(app.settle(merchant.address, 3n, ref))
      .to.emit(app, 'Settled')
      .withArgs(merchant.address, 3n, ref);
    expect(await token.balanceOf(merchant.address)).to.equal(5n);
    expect(await token.totalSupply()).to.equal(5n);
    await app.deactivateMerchant(merchant.address);
    await expect(app.settle(merchant.address, 2n, ethers.id('inactive settlement'))).to.emit(
      app,
      'Settled',
    );
    await expect(
      app.settle(other.address, 1n, ethers.id('unknown settlement')),
    ).to.be.revertedWithCustomError(app, 'MerchantNotActive');
    const supplyBeforeZeroSettle = await token.totalSupply();
    const balanceBeforeZeroSettle = await token.balanceOf(merchant.address);
    const settledEventsBeforeZeroSettle = await app.queryFilter(app.filters.Settled(), 0, 'latest');
    await expect(app.settle(merchant.address, 0n, ethers.ZeroHash)).to.be.revertedWithCustomError(
      app,
      'ZeroAmount',
    );
    expect(await app.queryFilter(app.filters.Settled(), 0, 'latest')).to.have.length(
      settledEventsBeforeZeroSettle.length,
    );
    expect(await token.totalSupply()).to.equal(supplyBeforeZeroSettle);
    expect(await token.balanceOf(merchant.address)).to.equal(balanceBeforeZeroSettle);
    await expect(
      app.settle(merchant.address, 4n, ethers.id('excess settlement')),
    ).to.be.revertedWithCustomError(app, 'InsufficientBalance');
    await app.pause();
    await expect(
      app.settle(merchant.address, 1n, ethers.id('paused settlement')),
    ).to.be.revertedWithCustomError(app, 'EnforcedPause');
  });
});
