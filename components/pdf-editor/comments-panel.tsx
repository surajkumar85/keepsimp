"use client"

import { useEffect, useId, useRef, useState } from "react"
import { IconArrowBackUp, IconTrash, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  commentHolds,
  commentName,
  countComments,
  type Comment,
} from "@/lib/pdf-editor/comments"
import { cssColour } from "@/lib/pdf-editor/styles"
import { cn } from "cn"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"

const moment = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
})

/** Who wrote something and when, as far as the file says. */
const signature = (author: string, when: number | null) =>
  [author, when === null ? "" : moment.format(when)].filter(Boolean).join(" · ")

const fieldClass =
  "w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

/** One comment in the list: what it is, its words, the talk under it, and a place to answer. */
function Card({
  comments,
  comment,
  page,
}: {
  comments: Comments
  comment: Comment
  /** Counted from 0. */
  page: number
}) {
  const ids = useId()
  const card = useRef<HTMLElement>(null)
  const words = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(comment.text)
  const [answer, setAnswer] = useState("")
  // What the file holds wins over what was last typed here, as after an undo.
  const [held, setHeld] = useState(comment.text)
  if (comment.text !== held) {
    setHeld(comment.text)
    setDraft(comment.text)
  }
  const picked = comments.picked?.id === comment.id
  const quote = comments.quotes[comment.id]
  const name = commentName(comment)
  const { typing, setTyping } = comments

  useEffect(() => {
    if (picked) card.current?.scrollIntoView({ block: "nearest" })
  }, [picked])
  // A note that was just placed is typed straight away.
  useEffect(() => {
    if (typing !== comment.id) return
    words.current?.focus({ preventScroll: true })
    setTyping(null)
  }, [typing, comment.id, setTyping])

  const save = () => {
    if (draft !== comment.text) void comments.setText(page, comment.id, draft)
  }
  const send = () => {
    if (!answer.trim()) return
    void comments.reply(page, comment.id, answer.trim())
    setAnswer("")
  }

  return (
    <article
      ref={card}
      data-testid="comment-card"
      data-kind={comment.kind}
      data-picked={picked || undefined}
      aria-labelledby={`${ids}-name`}
      className={cn(
        "space-y-2 rounded-lg border bg-card p-3",
        picked && "border-primary"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => comments.pick(page, comment.id, true)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9"
        >
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full border border-foreground/25"
            style={{
              backgroundColor: comment.colour
                ? cssColour(comment.colour)
                : undefined,
            }}
          />
          <span className="min-w-0">
            <span id={`${ids}-name`} className="block text-sm font-medium">
              {name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {signature(comment.author, comment.when) || "No author or date"}
            </span>
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete this ${name.toLowerCase()}`}
          title="Delete"
          onClick={() => void comments.remove(page, comment.id)}
        >
          <IconTrash aria-hidden="true" />
        </Button>
      </div>
      {quote && (
        <p
          className="line-clamp-3 border-l-2 pl-2 text-xs text-muted-foreground"
          data-testid="comment-quote"
        >
          {quote}
        </p>
      )}
      <label htmlFor={`${ids}-words`} className="sr-only">
        What this {name.toLowerCase()} says
      </label>
      <textarea
        ref={words}
        id={`${ids}-words`}
        rows={2}
        value={draft}
        placeholder="Add a comment"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        className={fieldClass}
      />
      {comment.replies.length > 0 && (
        <ul className="space-y-2 border-l-2 pl-2" aria-label="Replies">
          {comment.replies.map((reply) => (
            <li key={reply.id} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  {signature(reply.author, reply.when) || "Reply"}
                </p>
                <p className="text-sm break-words whitespace-pre-wrap">
                  {reply.text}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Delete this reply"
                title="Delete this reply"
                onClick={() => void comments.remove(page, reply.id, true)}
              >
                <IconX aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <label htmlFor={`${ids}-answer`} className="sr-only">
          Reply to this {name.toLowerCase()}
        </label>
        <Input
          id={`${ids}-answer`}
          value={answer}
          placeholder="Reply"
          autoComplete="off"
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label="Send the reply"
          title="Send the reply"
          disabled={!answer.trim()}
        >
          <IconArrowBackUp aria-hidden="true" />
        </Button>
      </form>
    </article>
  )
}

/**
 * Every comment of the file, page by page, beside the pages: the file's own
 * and new ones alike. A comment is read, answered, changed and deleted
 * here; pressing one takes the pages to it.
 */
export function CommentsPanel({
  editor,
  comments,
}: {
  editor: Editor
  comments: Comments
}) {
  const ids = useId()
  const [needle, setNeedle] = useState("")
  const total = countComments(editor.comments)
  const pages = editor.comments
    .map((list, page) => ({
      page,
      list: (list ?? []).filter((comment) =>
        commentHolds(comment, comments.quotes[comment.id] ?? "", needle)
      ),
    }))
    .filter(({ list }) => list.length)
  return (
    <aside
      aria-labelledby={`${ids}-title`}
      data-testid="editor-comments"
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[60%] flex-col border-t bg-popover shadow-lg md:static md:max-h-none md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="space-y-2 border-b p-2">
        <div className="flex items-center justify-between gap-2">
          <h2
            id={`${ids}-title`}
            className="px-1 font-heading text-sm font-medium"
          >
            Comments{" "}
            <span
              className="font-sans font-normal text-muted-foreground"
              data-testid="comments-count"
            >
              {total.toLocaleString("en")}
            </span>
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close the comments"
            title="Close the comments"
            onClick={() => comments.setListed(false)}
          >
            <IconX aria-hidden="true" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={`${ids}-name`}
              className="mb-1 block px-1 text-xs text-muted-foreground"
            >
              Your name
            </label>
            <Input
              id={`${ids}-name`}
              value={comments.author}
              autoComplete="name"
              placeholder="Not signed"
              onChange={(event) => comments.setAuthor(event.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor={`${ids}-find`}
              className="mb-1 block px-1 text-xs text-muted-foreground"
            >
              Find in comments
            </label>
            <Input
              id={`${ids}-find`}
              type="search"
              value={needle}
              autoComplete="off"
              onChange={(event) => setNeedle(event.target.value)}
            />
          </div>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2"
        tabIndex={pages.length ? undefined : 0}
      >
        {pages.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground" role="status">
            {total === 0
              ? "No comments yet. Mark words with a tool from the bar, or place a note."
              : "No comment holds those words."}
          </p>
        )}
        {pages.map(({ page, list }) => (
          <section key={page} className="space-y-2">
            <h3 className="px-1 text-xs font-medium text-muted-foreground">
              Page {(page + 1).toLocaleString("en")}
            </h3>
            {list.map((comment) => (
              <Card
                key={comment.id}
                comments={comments}
                comment={comment}
                page={page}
              />
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}
