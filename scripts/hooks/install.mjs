// Production/CI installs must not alter Git configuration or require Husky.
if (
  process.env.CI === "true" ||
  process.env.NODE_ENV === "production" ||
  process.env.HUSKY === "0"
) {
  process.exit(0);
}

const { default: husky } = await import("husky");
const error = husky();
if (error) throw new Error(error);
