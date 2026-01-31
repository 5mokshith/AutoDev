import { MutationCtx, QueryCtx } from "./_generated/server";

export const verifyAuth = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    if (process.env.NODE_ENV !== "production") {
      return {
        subject: "anonymous",
        issuer: "anonymous",
        tokenIdentifier: "anonymous",
      } as unknown as NonNullable<typeof identity>;
    }
    throw new Error("Unauthorized");
  }

  return identity;
};
