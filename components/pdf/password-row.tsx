"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "cn"

/** The form a locked file shows in its row: a password, a button and a hint that turns into an alert. */
export function PasswordRow({
  name,
  wrong,
  onUnlock,
}: {
  /** The file's name, for screen readers. */
  name: string
  /** A password was tried and did not open the file. */
  wrong: boolean
  onUnlock: (password: string) => void
}) {
  const id = useId()
  const [password, setPassword] = useState("")
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        onUnlock(password)
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium">
        Password<span className="sr-only"> for {name}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={wrong || undefined}
          aria-describedby={`${id}-hint`}
          className="w-56 max-w-full"
        />
        <Button type="submit" variant="outline">
          Unlock
        </Button>
      </div>
      <p
        id={`${id}-hint`}
        role={wrong ? "alert" : undefined}
        className={cn(
          "text-xs",
          wrong ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {wrong
          ? "That password did not open this file. Check it and try again."
          : "This file is locked. The password is used on your device and is not kept."}
      </p>
    </form>
  )
}
