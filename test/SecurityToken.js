const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SecurityToken Contract", function () {
    let securityToken, identityStorage, owner, agent, user1, user2, user3, modularCompliance;

    beforeEach(async function () {
        [owner, agent, user1, user2, user3] = await ethers.getSigners();

        const IdentityStorageMock = await ethers.getContractFactory("IdentityStorage");
        identityStorage = await IdentityStorageMock.deploy();
        await identityStorage.initialize();

        const ModularCompliance = await ethers.getContractFactory("ModularCompliance");
        modularCompliance = await ModularCompliance.deploy();
        await modularCompliance.init();

        const SecurityToken = await ethers.getContractFactory("SecurityToken");
        securityToken = await SecurityToken.deploy();

        console.log("SecurityToken deployed to:", securityToken.target);

        await securityToken.connect(owner).init(
            identityStorage,
            modularCompliance,
            "MyToken",
            "MTK",
            18,
            ethers.parseEther("1000000")
        );

        // await securityToken.setCompliance(owner.address);
    });

    describe("Initialization", function () {
        it("Should initialize with correct values", async function () {
            expect(await securityToken.name()).to.equal("MyToken");
            expect(await securityToken.symbol()).to.equal("MTK");
            expect(await securityToken.decimals()).to.equal(18);
            expect(await securityToken.totalSupply()).to.equal(0);
        });

        it("Should fail to initialize twice", async function () {
            await expect(securityToken.init(
                identityStorage,
                modularCompliance,
                "MyToken",
                "MTK",
                18,
                ethers.parseEther("1000000")
            )).to.be.revertedWithCustomError(securityToken, "InvalidInitialization");
        });
    });

    // describe("setName", function () {
    //     it("Should allow owner to set a new name", async function () {
    //         await securityToken.setName("NewTokenName");
    //         expect(await securityToken.name()).to.equal("NewTokenName");
    //     });

    //     it("Should revert if name is an empty string", async function () {
    //         await expect(securityToken.setName("")).to.be.revertedWith("invalid argument - empty string");
    //     });

    //     it("Should revert if non-owner tries to set name", async function () {
    //         await expect(securityToken.connect(user1).setName("AnotherTokenName")).to.be.revertedWithCustomError(securityToken, "OwnableUnauthorizedAccount").withArgs(user1.address);
    //     });
    // });

    // describe("setSymbol", function () {
    //     it("Should allow owner to set a new symbol", async function () {
    //         await securityToken.setSymbol("NEW");
    //         expect(await securityToken.symbol()).to.equal("NEW");
    //     });

    //     it("Should revert if symbol is an empty string", async function () {
    //         await expect(securityToken.setSymbol("")).to.be.revertedWith("invalid argument - empty string");
    //     });

    //     it("Should revert if non-owner tries to set symbol", async function () {
    //         await expect(securityToken.connect(user1).setSymbol("SYM")).to.be.revertedWithCustomError(securityToken, "OwnableUnauthorizedAccount").withArgs(user1.address);
    //     });
    // });

    describe("setIdentityStorage", function () {
        it("Should allow owner to set a new identity storage address", async function () {
            const newIdentityStorage = await ethers.getContractFactory("IdentityStorage");
            const newIdentityInstance = await newIdentityStorage.deploy();
            console.log("Deployed at :",  newIdentityInstance.target);

            await securityToken.setIdentityStorage(newIdentityInstance);
            expect(await securityToken.identityStorage()).to.equal(newIdentityInstance);
        });

        it("Should revert if address is zero", async function () {
            await expect(securityToken.setIdentityStorage(ethers.ZeroAddress)).to.be.revertedWith("invalid argument - zero address");
        });

        it("Should revert if non-owner tries to set identity storage", async function () {
            const newIdentityStorage = await ethers.getContractFactory("IdentityStorage");
            const newIdentityInstance = await newIdentityStorage.deploy();
            newIdentityInstance.target;

            await expect(securityToken.connect(user1).
            setIdentityStorage(newIdentityInstance)).to.be.revertedWithCustomError(securityToken, "OwnableUnauthorizedAccount").withArgs(user1.address);
        });
    });

    describe("Ownership and Agent Roles", function () {
        it("Only owner or agent can call functions with onlyOwnerOrAgent modifier", async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.mint(user1.address, ethers.parseEther("1000"));
            await expect(securityToken.connect(user1).freezePartialTokens(user1.address, 1000)).to.be.revertedWith("Caller is not owner or agent");
            await securityToken.addAgent(agent.address);
            await securityToken.connect(agent).freezePartialTokens(user1.address, 1000);
            expect(await securityToken.getFrozenTokens(user1.address)).to.equal(1000);
        });
    });

    describe("Minting and Burning", function () {
        beforeEach(async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
        });
    
        it("Should mint tokens for a valid investor", async function () {
            await securityToken.connect(owner).mint(user1.address, ethers.parseEther("1000"));
            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
        });
    
        it("Should not mint tokens above maxTotalSupply", async function () {
            await expect(
                securityToken.connect(owner).mint(user1.address, ethers.parseEther("1000001"))
            ).to.be.revertedWith("Minting exceeds total supply limit");
        });
    
        it("Should burn tokens from user address", async function () {
            await securityToken.connect(owner).mint(user1.address, ethers.parseEther("1000"));
            await securityToken.connect(owner).burn(user1.address, ethers.parseEther("500"));
            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
        });
    });
    

    describe("Transfers", function () {
        beforeEach(async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.mint(user1.address, ethers.parseEther("1000"));
        });

        it("Should transfer tokens between users", async function () {
            await securityToken.unpause();
            await securityToken.connect(user1).transfer(user2.address, ethers.parseEther("500"));
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("500"));
        });

        it("Should not transfer tokens if paused", async function () {
            expect(securityToken.connect(user1).transfer(user2.address, ethers.parseEther("500"))).to.be.revertedWith("Pausable: paused");
        });

        it("Should prevent transfers from frozen addresses", async function () {
            await securityToken.unpause();
            await securityToken.setAddressFrozen(user1.address, true);
            await expect(securityToken.connect(user1).transfer(user2.address, ethers.parseEther("500"))).to.be.revertedWith("wallet is frozen");
        });
    });

    describe("Batch Operations", function () {
        it("Should perform batch minting", async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.batchMint([user1.address, user2.address], [ethers.parseEther("100"), ethers.parseEther("200")]);
            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));
        });

        it("Should perform batch transfer", async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.mint(user1.address, ethers.parseEther("500"));
            await securityToken.unpause();
            await securityToken.connect(user1).batchTransfer([user2.address], [ethers.parseEther("200")]);
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));
        });
    });

    describe("Pausing and Unpausing", function () {
        it("Only owner can pause and unpause the contract", async function () {
            await expect(securityToken.connect(user1).pause()).to.be.revertedWithCustomError(securityToken, "OwnableUnauthorizedAccount").withArgs(user1.address);
            await expect(securityToken.connect(user1).unpause()).to.be.revertedWithCustomError(securityToken, "OwnableUnauthorizedAccount").withArgs(user1.address);
        });
    });

    describe("Forced Transfers and Freezing Scenarios", function () {
        beforeEach(async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);

            await securityToken.mint(user1.address, ethers.parseEther("1000"));
            await securityToken.mint(user2.address, ethers.parseEther("1000"));
    
            await securityToken.addAgent(agent.address);
        });
    
        describe("Forced Transfer", function () {
            it("Should force transfer even if tokens are frozen", async function () {
                // Freeze part of user1's tokens
                await securityToken.freezePartialTokens(user1.address, ethers.parseEther("500"));
    
                // Agent initiates forced transfer despite frozen tokens
                await securityToken.connect(agent).forcedTransfer(user1.address, user2.address, ethers.parseEther("700"));
    
                // Check balances post forced transfer
                expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("300"));
                expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("1700"));
            });
    
            it("Should fail forced transfer if insufficient tokens after freezing", async function () {
                await securityToken.freezePartialTokens(user1.address, ethers.parseEther("800"));
                await expect(
                    securityToken.connect(agent).forcedTransfer(user1.address, user2.address, ethers.parseEther("1100"))
                ).to.be.revertedWith("sender balance too low");
            });
    
            it("Should emit TokensUnfrozen event during forced transfer if required", async function () {
                await securityToken.freezePartialTokens(user1.address, ethers.parseEther("800"));
    
                // Expect TokensUnfrozen event because forced transfer requires unfreezing some tokens
                await expect(securityToken.connect(agent).forcedTransfer(user1.address, user2.address, ethers.parseEther("900")))
                    .to.emit(securityToken, "TokensUnfrozen")
                    .withArgs(user1.address, ethers.parseEther("700"));
    
                expect(await securityToken.getFrozenTokens(user1.address)).to.equal(ethers.parseEther("100"));
            });
    
            it("Should revert forced transfer if recipient is not a valid investor", async function () {
                await expect(
                    securityToken.connect(agent).forcedTransfer(user1.address, user3.address, ethers.parseEther("500"))
                ).to.be.revertedWith("Transfer not possible");
            });
        });
    
    describe("Batch Forced Transfer", function () {
        it("Should allow batch forced transfer for multiple accounts", async function () {
            await securityToken.connect(agent).batchForcedTransfer(
                [user1.address, user2.address],
                [user2.address, user1.address],
                [ethers.parseEther("300"), ethers.parseEther("500")]
            );

            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1200"));
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("800"));
        });

        it("Should handle batch forced transfer where some tokens are frozen", async function () {
            await securityToken.freezePartialTokens(user1.address, ethers.parseEther("200"));
            await securityToken.freezePartialTokens(user2.address, ethers.parseEther("300"));

            await securityToken.connect(agent).batchForcedTransfer(
                [user1.address, user2.address],
                [user2.address, user1.address],
                [ethers.parseEther("900"), ethers.parseEther("1700")]
            );

            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1800"));
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));
        });

        it("Should revert batch forced transfer if any transfer fails", async function () {
            await expect(
                securityToken.connect(agent).batchForcedTransfer(
                    [user1.address, user3.address],
                    [user3.address, user1.address],
                    [ethers.parseEther("300"), ethers.parseEther("300")]
                )
            ).to.be.revertedWith("Transfer not possible");
        });

        it("Should emit TokensUnfrozen event in batch forced transfer if required", async function () {
            await securityToken.freezePartialTokens(user1.address, ethers.parseEther("200"));
            await securityToken.freezePartialTokens(user2.address, ethers.parseEther("300"));

            await expect(securityToken.connect(agent).batchForcedTransfer(
                [user1.address, user2.address],
                [user2.address, user1.address],
                [ethers.parseEther("900"), ethers.parseEther("1700")]
            ))
                .to.emit(securityToken, "TokensUnfrozen")
                .withArgs(user1.address, ethers.parseEther("100"))
                .and.to.emit(securityToken, "TokensUnfrozen")
                .withArgs(user2.address, ethers.parseEther("100"));

            expect(await securityToken.getFrozenTokens(user1.address)).to.equal(ethers.parseEther("100"));
            expect(await securityToken.getFrozenTokens(user2.address)).to.equal(ethers.parseEther("200"));
        });
    });

    describe("Edge Case Scenarios", function () {

        it("Should handle transferring entire balance when partially frozen", async function () {
            await securityToken.freezePartialTokens(user1.address, ethers.parseEther("200"));
            await securityToken.connect(agent).forcedTransfer(user1.address, user2.address, ethers.parseEther("1000"));

            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("0"));
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("2000"));
        });

        it("Should revert forced transfer if from or to address is zero", async function () {
            await expect(securityToken.connect(agent).forcedTransfer(ethers.ZeroAddress, user2.address, ethers.parseEther("100")))
                .to.be.revertedWith("sender balance too low");
            await expect(securityToken.connect(agent).forcedTransfer(user1.address, ethers.ZeroAddress, ethers.parseEther("100")))
                .to.be.revertedWith("Transfer not possible");
        });

        it("Should fail batchForcedTransfer if arrays have unequal lengths", async function () {
            await expect(securityToken.connect(agent).batchForcedTransfer(
                [user1.address, user2.address],
                [user2.address],
                [ethers.parseEther("300"), ethers.parseEther("300")]
            )).to.be.revertedWithPanic("0x32");
        });
    });
});
});
