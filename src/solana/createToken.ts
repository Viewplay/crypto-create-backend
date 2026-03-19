import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { createMetadataIx, updateMetadataAuthorityIx } from "./metadata";
import { enforceSymbol } from "./utils";
import { uploadJsonToIpfs } from "../storage/nftStorage";

export type RevokeOptions = {
  revokeFreeze: boolean;
  revokeMint: boolean;
  revokeUpdate: boolean;
};

type TokenInput = {
  name: string;
  symbol: string;
  decimals: number;
  supply: string; // integer units
  description?: string;
  imageUrl: string; // ipfs://... (from upload-image)
  social?: Record<string, string | undefined>;
};

type Params = {
  connection: Connection;
  feePayer: Keypair; // server signer paying fees
  buyer: PublicKey; // client wallet to receive supply
  token: TokenInput;
  options: RevokeOptions;
  updateAuthorityBurn: PublicKey;
};

function pow10(decimals: number): bigint {
  let x = 1n;
  for (let i = 0; i < decimals; i++) x *= 10n;
  return x;
}

function buildMetadataJson(input: {
  name: string;
  symbol: string;
  description: string;
  image: string;
  social: Record<string, string | undefined>;
}) {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.image,
    external_url: input.social.website ?? "",
    attributes: [],
    properties: {
      files: [{ uri: input.image, type: "image/png" }],
      category: "image",
    },
    links: {
      twitter: input.social.twitter ?? "",
      telegram: input.social.telegram ?? "",
      discord: input.social.discord ?? "",
    },
  };
}

export async function createTokenWithMetadata(params: Params): Promise<{
  mint: PublicKey;
  signatures: string[];
  metadataUri: string;
}> {
  const { connection, feePayer, buyer, token, options, updateAuthorityBurn } = params;

  const name = token.name.trim();
  const symbol = enforceSymbol(token.symbol);
  const decimals = token.decimals;

  const supplyUnits = BigInt(token.supply);
  const amount = supplyUnits * pow10(decimals);

  // 1) Upload metadata.json to IPFS (Pinata)
  const metadataJson = buildMetadataJson({
    name,
    symbol,
    description: token.description ?? "",
    image: token.imageUrl,
    social: token.social ?? {},
  });

  const metadataUri = await uploadJsonToIpfs({
    name: `${symbol}-metadata.json`,
    json: metadataJson,
  });

  // 2) Create mint + mint supply
  const mintKeypair = Keypair.generate();
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

  const buyerAta = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    buyer,
    false,
    TOKEN_PROGRAM_ID
  );

  const signatures: string[] = [];

  // TX1: create mint + init mint + create ATA + mint supply
  {
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports: mintRent,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        feePayer.publicKey, // mint authority (server)
        feePayer.publicKey, // freeze authority (server) optional revoke later
        TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        feePayer.publicKey,
        buyerAta,
        buyer,
        mintKeypair.publicKey,
        TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(
        mintKeypair.publicKey,
        buyerAta,
        feePayer.publicKey,
        amount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [feePayer, mintKeypair], {
      commitment: "confirmed",
    });
    signatures.push(sig);
  }

  // TX2: metadata creation (Metaplex) using ipfs://... metadataUri
  {
    const tx = new Transaction().add(
      createMetadataIx({
        mint: mintKeypair.publicKey,
        mintAuthority: feePayer.publicKey,
        payer: feePayer.publicKey,
        updateAuthority: feePayer.publicKey,
        name,
        symbol,
        uri: metadataUri,
      })
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [feePayer], {
      commitment: "confirmed",
    });
    signatures.push(sig);
  }

  // TX3: revokes (mint/freeze/update)
  {
    const tx = new Transaction();

    if (options.revokeMint) {
      tx.add(
        createSetAuthorityInstruction(
          mintKeypair.publicKey,
          feePayer.publicKey,
          AuthorityType.MintTokens,
          null
        )
      );
    }

    if (options.revokeFreeze) {
      tx.add(
        createSetAuthorityInstruction(
          mintKeypair.publicKey,
          feePayer.publicKey,
          AuthorityType.FreezeAccount,
          null
        )
      );
    }

    if (options.revokeUpdate) {
      tx.add(
        updateMetadataAuthorityIx({
          mint: mintKeypair.publicKey,
          currentUpdateAuthority: feePayer.publicKey,
          newUpdateAuthority: updateAuthorityBurn,
        })
      );
    }

    if (tx.instructions.length > 0) {
      const sig = await sendAndConfirmTransaction(connection, tx, [feePayer], {
        commitment: "confirmed",
      });
      signatures.push(sig);
    }
  }

  return { mint: mintKeypair.publicKey, signatures, metadataUri };
}