import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata";

// Official Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

type CreateMetadataParams = {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
};

export function findMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf8"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

export function createMetadataIx(p: CreateMetadataParams) {
  const metadata = findMetadataPda(p.mint);

  return createCreateMetadataAccountV3Instruction(
    {
      metadata,
      mint: p.mint,
      mintAuthority: p.mintAuthority,
      payer: p.payer,
      updateAuthority: p.updateAuthority,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: p.name,
          symbol: p.symbol,
          uri: p.uri,
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    }
  );
}

export function updateMetadataAuthorityIx(params: {
  mint: PublicKey;
  currentUpdateAuthority: PublicKey;
  newUpdateAuthority: PublicKey;
}) {
  const metadata = findMetadataPda(params.mint);

  return createUpdateMetadataAccountV2Instruction(
    {
      metadata,
      updateAuthority: params.currentUpdateAuthority,
    },
    {
      updateMetadataAccountArgsV2: {
        data: null,
        updateAuthority: params.newUpdateAuthority,
        primarySaleHappened: null,
        isMutable: false,
      },
    }
  );
}