import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const options: TutorialContent["options"] = [
  {
    term: "Same as the file",
    detail:
      "Keeps the file's own sound as it is, without decoding and encoding it again: AAC goes into an M4A, MP3 stays MP3, Opus and Vorbis go into Ogg, FLAC stays FLAC and plain samples become a WAV. Nothing is lost and it takes a moment. When the rate, the channels or a size limit you chose mean the sound must change, it is encoded again in its own kind; sound that cannot be kept (such as AC-3 from a film) becomes AAC, and the page says so.",
  },
  {
    term: "MP3",
    detail:
      "Plays everywhere. Written with LAME at a constant bitrate, with the header that tells players the encoder's delay and padding, so the file is exactly as long as the sound. Below 32 kHz an MP3 holds at most 160 kbit/s.",
  },
  {
    term: "M4A (AAC) and M4R",
    detail:
      "Smaller than MP3 for the same quality, and played by every phone and computer. Written with your browser's own AAC encoder, or one that comes with the page when it has none. The encoder's priming is measured and an edit list written, so the sound starts and ends where it should. M4R is the same for an iPhone ringtone, which can be at most 40 seconds long (an alert tone 30).",
  },
  {
    term: "Opus",
    detail:
      "The best quality for its size, voice above all. It is always written at 48 kHz. Browsers, Android, VLC and recent Apple devices play it.",
  },
  {
    term: "FLAC and WAV",
    detail:
      "Lossless: every sample is kept. FLAC is about half the size of WAV. Choose 16-bit (CD quality), 24-bit, or for WAV 32-bit floating point; FLAC holds at most 24 bits.",
  },
  {
    term: "Quality",
    detail:
      "Small, Balanced or High set the bitrate for each format (MP3 96, 192 or 320 kbit/s; AAC 96, 160 or 256; Opus 48, 96 or 160), less for mono. Custom lets you pick the bitrate. These numbers are KeepSimp's own choices.",
  },
  {
    term: "Sample rate and channels",
    detail:
      "Keep the file's own, or choose one. When a format cannot hold the rate asked, the nearest it can is used and the page says so. Lossy formats here are mono or stereo, so surround sound is mixed down to stereo for them.",
  },
  {
    term: "Tags and cover art",
    detail:
      "Title, artist, album, year, genre and the cover picture go into the new file where its format holds them. Switch it off to write none.",
  },
  {
    term: "File size limit",
    detail:
      "MP3, M4A and Opus are written at the highest bitrate that keeps each file under the limit, with room for the container; the page says what it chose. Lossless formats cannot be made to fit a size.",
  },
  {
    term: "The check",
    detail:
      "Every file written is opened again and decoded from start to end. Its length, sample rate and channels are held against what was asked, an MP3's size against its bitrate, and a file that came out silent is caught. If something is not as asked, the page says what.",
  },
  {
    term: "Files the browser cannot read",
    detail:
      "Some browsers' decoders lack a kind of sound (Safari's lacks FLAC in some places). The page then decodes it with the browser's own player, which plays more kinds, and goes on. AIFF is read by KeepSimp itself. A file nothing here can decode says so.",
  },
  {
    term: "Privacy",
    detail:
      "Files are read and written in this browser and never uploaded. There is no account and no limit on how many you convert.",
  },
]

const converting: TutorialContent = {
  name: "How to convert audio with KeepSimp",
  description:
    "Convert audio between MP3, M4A (AAC), Opus, FLAC, WAV and iPhone ringtones in your browser, many files at once, keeping tags and cover art. Every file is checked before you download it. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your files",
      text: "Drop them, choose them or paste them: MP3, M4A, Opus, Ogg, FLAC, WAV, AIFF, or videos whose sound you want. Up to 50 at once.",
    },
    {
      title: "Choose the format",
      text: "MP3, M4A, Opus, FLAC, WAV or an iPhone ringtone, a quality, and if you like a sample rate, mono or stereo, and a file size limit.",
    },
    {
      title: "Listen and check",
      text: "Each file is written as soon as it is read. Listen to the original or the result, and read what the check found.",
    },
    {
      title: "Download",
      text: "One file at a time from the list, or everything as one ZIP.",
    },
  ],
  options,
  guideHref: "/blog/convert-audio-without-uploading/",
}

const extracting: TutorialContent = {
  name: "How to take the sound out of a video with KeepSimp",
  description:
    "Extract the audio of an MP4, MOV, WebM or MKV video in your browser, exactly as it is or as MP3, M4A, FLAC or WAV. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add the video",
      text: "Drop it, choose it or paste it: MP4, MOV, WebM or MKV, one or many.",
    },
    {
      title: "Keep the sound as it is",
      text: "“Same as the file” is chosen for you: the sound is copied out without being encoded again, so nothing is lost, and the picture is left behind.",
    },
    {
      title: "Or choose a format",
      text: "MP3 for anything that plays music, M4A for phones, FLAC or WAV for editing.",
    },
    {
      title: "Download",
      text: "The sound is checked and ready to download, one file or all as a ZIP.",
    },
  ],
  options,
  guideHref: "/blog/extract-audio-from-video/",
}

export function AudioConverterTutorial() {
  return <ToolTutorial content={converting} />
}

export function AudioExtractorTutorial() {
  return <ToolTutorial content={extracting} />
}
