"use client"

import { useId, useRef } from "react"
import { IconCertificate, IconFileUpload } from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { daySaid } from "@/lib/pdf-editor/certify"
import type { Certify, Where } from "./use-certify"

/**
 * The download's part for signing with a certificate: the certificate
 * file and its password, who it names, where the signature shows and what
 * it says. Everything is read on this device.
 */
export function CertifyFields({
  certify,
  pages,
}: {
  certify: Certify
  /** How many pages the file has, for a box on one of them. */
  pages: number
}) {
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  const { opened } = certify
  const signer = opened?.signer
  return (
    <>
      <ToggleRow
        label="Sign with a certificate"
        hint="A digital signature made with your certificate (.p12 or .pfx), which programs that check signatures can verify. The certificate and its password are read on this device and are not kept or sent anywhere."
        checked={certify.on}
        onCheckedChange={certify.setOn}
      />
      {certify.on && (
        <div className="space-y-3" data-testid="editor-certify">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={picker}
              type="file"
              accept=".p12,.pfx,application/x-pkcs12"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="certificate-file"
              onChange={(event) => {
                const chosen = event.target.files?.[0]
                if (chosen) void certify.choose(chosen)
                event.target.value = ""
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => picker.current?.click()}
            >
              <IconFileUpload aria-hidden="true" />
              {certify.file
                ? "Choose another certificate"
                : "Choose a certificate"}
            </Button>
            {certify.file && (
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {certify.file.name}
              </span>
            )}
          </div>
          {certify.file && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void certify.open()
              }}
            >
              <label
                htmlFor={`${ids}-password`}
                className="block text-sm font-medium"
              >
                The certificate&apos;s password
              </label>
              <div className="flex gap-2">
                <Input
                  id={`${ids}-password`}
                  type="password"
                  autoComplete="off"
                  value={certify.password}
                  onChange={(event) => certify.setPassword(event.target.value)}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={certify.opening}
                >
                  Open
                </Button>
              </div>
            </form>
          )}
          {certify.unread && (
            <p role="alert" className="text-sm text-destructive">
              {certify.unread}
            </p>
          )}
          {signer && (
            <div
              className="flex items-start gap-2 rounded-md border p-3 text-sm"
              data-testid="certificate-signer"
            >
              <IconCertificate
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p>
                <span className="block font-medium">{signer.name}</span>
                <span className="text-muted-foreground">
                  {signer.selfSigned
                    ? "Signed by itself"
                    : `Issued by ${signer.issuer}`}
                  {" · "}valid until {daySaid(signer.validTo)} · {signer.key}
                </span>
              </p>
            </div>
          )}
          {signer && (
            <>
              <ChoiceChips<Where>
                label="Where the signature shows"
                value={certify.where}
                onValueChange={certify.setWhere}
                options={[
                  { value: "none", label: "Not on a page" },
                  { value: "box", label: "A box on a page" },
                  ...opened.places.map((name) => ({
                    value: `field:${name}` as Where,
                    label: `In “${name}”`,
                  })),
                ]}
              />
              {certify.where === "box" && (
                <div>
                  <label
                    htmlFor={`${ids}-page`}
                    className="mb-1 block text-sm font-medium"
                  >
                    Page
                  </label>
                  <Input
                    id={`${ids}-page`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={pages}
                    value={certify.page}
                    onChange={(event) => certify.setPage(event.target.value)}
                    aria-describedby={`${ids}-page-hint`}
                  />
                  <p
                    id={`${ids}-page-hint`}
                    className="mt-1 text-xs text-muted-foreground"
                  >
                    The box goes at the foot of the page, on the right.
                  </p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`${ids}-reason`}
                    className="mb-1 block text-sm font-medium"
                  >
                    Reason (if you like)
                  </label>
                  <Input
                    id={`${ids}-reason`}
                    value={certify.reason}
                    maxLength={200}
                    onChange={(event) => certify.setReason(event.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${ids}-location`}
                    className="mb-1 block text-sm font-medium"
                  >
                    Place (if you like)
                  </label>
                  <Input
                    id={`${ids}-location`}
                    value={certify.location}
                    maxLength={200}
                    onChange={(event) =>
                      certify.setLocation(event.target.value)
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Signing is done last, after everything else, and covers the
                whole file. Who to trust is up to the program that opens it: a
                certificate it does not know is shown as unknown.
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
