import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata(
  "Privacy — How your files are handled",
  "Understand how KeepSimp processes files locally, stores display preferences, and separates browser tools from website hosting.",
  "/privacy/"
)
export default function PrivacyPage() {
  return (
    <div className="marketing-container max-w-3xl! py-14 sm:py-20">
      <p className="eyebrow mb-4 text-primary">Your work stays close</p>
      <h1 className="marketing-heading">
        A straightforward approach to privacy.
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Updated 14 October 2026
      </p>
      <div className="article-copy">
        <h2>Files and text stay in your browser.</h2>
        <p>
          The image and PDF tools read the files you choose on your device and
          hand you the results through your browser. The JSON formatter
          processes pasted text in the current tab. KeepSimp’s application does
          not upload this content or store it on a server, and it saves none of
          it in browser storage unless you ask it to (see below). Otherwise,
          leaving or refreshing a tool page clears what you were working on.
          Downloads are saved wherever your browser normally saves them.
        </p>
        <h2>What is kept only when you ask.</h2>
        <p>
          The PDF editor can keep three things in this browser’s own storage, on
          this device. Each is kept only after you turn it on or type it, and
          none is sent anywhere. The name you sign your comments with is kept
          once you type one. A signature or your initials are kept when you
          switch on “Remember this signature on this device”, until you press
          “Forget it”. A draft of a PDF you are editing (the file, the pictures
          you placed, another PDF whose pages you added, a font of your own if
          you used one, and your changes) is kept when you switch on “Keep a
          draft on this device”, until you close the file, throw the draft away
          or switch it off. Do not turn these on at a computer other people use.
          You can also remove them through your browser’s site-data settings.
        </p>
        <h2>The website still loads from a host.</h2>
        <p>
          Page HTML, scripts, fonts and public images load from the website
          host, Vercel. A host receives ordinary request information such as an
          IP address, the requested URL and browser headers. Browser-local
          processing does not mean website visits are invisible to the hosting
          infrastructure. This application does not include advertising scripts
          or analytics trackers.
        </p>
        <h2>A couple of display preferences.</h2>
        <p>
          The app stores your chosen light or dark theme in local storage and
          may store the desktop sidebar state in a cookie. Those preferences
          contain no selected files or pasted text. You can remove them through
          your browser’s site-data settings.
        </p>
        <h2>A copy of the tools for offline use.</h2>
        <p>
          Once you open the tools, your browser keeps a copy of KeepSimp’s own
          pages, scripts, fonts and codecs, about 37 MB, so they work without a
          connection. That copy contains none of your files or text. It is
          replaced when a new version is published, and you can remove it
          through your browser’s site-data settings. What recognises the words
          of scanned pages (about 7 MB) is not part of it until you first
          recognise text; it is then kept the same way. It too holds none of
          your files, and the words it finds go only into the PDF you are
          editing.
        </p>
        <h2>Keep the limits in mind.</h2>
        <p>
          Browser extensions, clipboard synchronization and device software can
          have their own access to content. Use a browser and device you trust.
          Keep original files: image exports can remove metadata, profiles,
          transparency or animation depending on the chosen format. Follow any
          requirements that apply to the information you handle.
        </p>
        <h2>Future tools follow the same direction.</h2>
        <p>
          Video and audio tools remain marked as coming soon. Their data
          handling will be documented when they are implemented. If a future
          tool needs a different approach, the interface and this page must
          explain it before a user provides content.
        </p>
      </div>
    </div>
  )
}
