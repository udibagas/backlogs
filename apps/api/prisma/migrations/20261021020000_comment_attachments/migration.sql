CREATE TABLE "CommentAttachment" (
    "id" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentAttachment_storedName_key" ON "CommentAttachment"("storedName");
CREATE INDEX "CommentAttachment_commentId_createdAt_idx" ON "CommentAttachment"("commentId", "createdAt");

ALTER TABLE "CommentAttachment"
ADD CONSTRAINT "CommentAttachment_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
