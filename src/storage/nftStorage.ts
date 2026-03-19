import axios from "axios";
import FormData from "form-data";

type UploadInput = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

function mustGetPinataJwt(): string {
  const jwt = process.env.PINATA_JWT ?? "";
  if (!jwt) throw new Error("Missing PINATA_JWT");
  return jwt;
}

/**
 * Uploads a file (image) to IPFS via Pinata.
 * Returns: ipfs://<cid>
 */
export async function uploadToNftStorage(input: UploadInput): Promise<string> {
  const jwt = mustGetPinataJwt();

  const form = new FormData();
  form.append("file", input.buffer, {
    filename: input.filename || "logo.png",
    contentType: input.contentType || "image/png",
  });

  form.append(
    "pinataMetadata",
    JSON.stringify({
      name: input.filename || "crypto-create-upload",
    })
  );

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
  });

  const cid = res?.data?.IpfsHash;
  if (!cid) throw new Error("Pinata upload failed: missing IpfsHash");

  return `ipfs://${cid}`;
}

/**
 * Uploads JSON (metadata) to IPFS via Pinata.
 * Returns: ipfs://<cid>
 */
export async function uploadJsonToIpfs(params: {
  name: string;
  json: unknown;
}): Promise<string> {
  const jwt = mustGetPinataJwt();

  const res = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", params.json, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    params: {
      pinataMetadata: JSON.stringify({ name: params.name }),
    },
  });

  const cid = res?.data?.IpfsHash;
  if (!cid) throw new Error("Pinata JSON upload failed: missing IpfsHash");

  return `ipfs://${cid}`;
}