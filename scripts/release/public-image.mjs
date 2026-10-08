import { fileURLToPath } from "node:url";
import { isRepository, isStableVersion } from "./rules.mjs";

// Publishing credentials can pull a private package. Verify the installer's
// exact image through the anonymous registry flow instead.
export async function verifyPublicImage(
  repository,
  version,
  {
    request = fetch,
    attempts = 3,
    wait = () => new Promise((resolve) => setTimeout(resolve, 2000)),
  } = {},
) {
  if (!isRepository(repository) || !isStableVersion(version)) {
    throw new Error("Invalid public image identity.");
  }
  const name = repository.toLowerCase();
  const image = `ghcr.io/${name}:v${version}`;
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(
        `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${name}:pull`)}`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) {
        throw new Error(
          `Anonymous pull of ${image} failed (HTTP ${response.status}). Make the GHCR package public and verify the version exists before publishing the installer.`,
        );
      }
      const credentials = await response.json();
      const token = credentials.token ?? credentials.access_token;
      if (typeof token !== "string" || !token) {
        throw new Error("GHCR did not return an anonymous pull token.");
      }
      const manifest = await request(
        `https://ghcr.io/v2/${name}/manifests/v${version}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept:
              "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!manifest.ok) {
        throw new Error(
          `Anonymous manifest read of ${image} failed (HTTP ${manifest.status}). Verify the matching public image before publishing the installer.`,
        );
      }
      const index = await manifest.json();
      for (const architecture of ["amd64", "arm64"]) {
        if (
          !index.manifests?.some(
            ({ platform }) =>
              platform?.os === "linux" &&
              platform?.architecture === architecture,
          )
        ) {
          throw new Error(
            `${image} is missing its linux/${architecture} image.`,
          );
        }
      }
      return image;
    } catch (error) {
      failure = error;
      if (attempt + 1 < attempts) await wait();
    }
  }
  throw failure;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const image = await verifyPublicImage(
      process.env.GITHUB_REPOSITORY,
      process.env.RELEASE_VERSION,
    );
    console.log(
      `Anonymous pull verified for ${image} (linux/amd64, linux/arm64).`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
