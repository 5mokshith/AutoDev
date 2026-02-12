import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    ownerId: v.string(),
    updatedAt: v.number(),
    importStatus: v.optional(
      v.union(
        v.literal("importing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    exportStatus: v.optional(
      v.union(
        v.literal("exporting"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
    exportRepoUrl: v.optional(v.string()),
    settings: v.optional(
      v.object({
        installCommand: v.optional(v.string()),
        devCommand: v.optional(v.string()),
      })
    ),
  }).index("by_owner", ["ownerId"]),

  files: defineTable({
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    type: v.union(v.literal("file"), v.literal("folder")),
    content: v.optional(v.string()), // Text files only
    storageId: v.optional(v.id("_storage")), // Binary files only
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentId"])
    .index("by_project_parent", ["projectId", "parentId"]),

  conversations: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
    aiProvider: v.optional(v.string()),
    aiModel: v.optional(v.string()),
    aiTemperature: v.optional(v.number()),
    aiMaxOutputTokens: v.optional(v.number()),
    aiIterations: v.optional(v.number()),
    aiToolCalls: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_project_status", ["projectId", "status"]),

  agentEvents: defineTable({
    projectId: v.id("projects"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    type: v.union(
      v.literal("createFiles"),
      v.literal("updateFile"),
      v.literal("createFolder"),
      v.literal("renameFile"),
      v.literal("deleteFiles"),
      v.literal("readFiles"),
      v.literal("listFiles")
    ),
    status: v.optional(
      v.union(v.literal("running"), v.literal("done"), v.literal("error"))
    ),
    fileId: v.optional(v.id("files")),
    fileIds: v.optional(v.array(v.id("files"))),
    parentId: v.optional(v.id("files")),
    name: v.optional(v.string()),
    names: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_conversation", ["conversationId"])
    .index("by_project", ["projectId"]),
});
