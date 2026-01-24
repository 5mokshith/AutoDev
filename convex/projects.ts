import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
export const create = mutation({
    args: {
        name: v.string(),
    },
    handler: async(ctx, args) => {
        await ctx.db.insert("projects", {
            name: args.name,
            ownerId: "12345",
        });
    },
});

export const get = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("projects").collect();
    },
});