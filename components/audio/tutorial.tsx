import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"
import { JOIN_FADE, MOST_GAIN } from "@/lib/audio/edits"
import { MOST_LOUDER, MOST_RAISE, TARGETS } from "@/lib/audio/level"
import { COMPRESSORS } from "@/lib/audio/dynamics"
import { LOOKAHEAD, RELEASE } from "@/lib/audio/limiter"
import { MOST_PARTS } from "@/lib/audio/split"
import { CROSSFADES, GAPS } from "@/lib/audio/join"
import {
  KEPT_EDGE,
  KEPT_PAUSE,
  PAUSES,
  SILENCE_LEVELS,
} from "@/lib/audio/silence"
import {
  BASS_HZ,
  MID_HZ,
  MOST_BAND,
  TONE_PRESETS,
  TREBLE_HZ,
} from "@/lib/audio/tone"
import { RINGTONES } from "@/lib/audio/ringtone"
import { shortcutGroups } from "@/lib/audio/shortcuts"

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

/** The keys, as the help says them: made from the list the editor answers to. */
const keys = shortcutGroups().map((group) => ({
  term: `Keys: ${group.title.toLowerCase()}`,
  detail: group.shortcuts
    .map(
      (shortcut) =>
        `${shortcut.ways.map((way) => way.join(" + ")).join(" or ")}: ${shortcut.does}.`
    )
    .join(" "),
}))

const leveling: TutorialContent["options"] = [
  {
    term: "Normalize loudness",
    detail: `Each file is measured as it will be written, after its edits, at its new rate and channels, as ITU-R BS.1770 measures loudness (K-weighted, gated), and made louder or quieter to reach the target: ${TARGETS.map((target) => `${target.label} for ${target.for}`).join("; ")}, or one of your own. Files normalized together come out equally loud. A file is made at most ${MOST_RAISE} dB louder.`,
  },
  {
    term: "The limiter and the ceiling",
    detail: `When a file is made louder, its loudest moments could go over full scale and clip. The limiter looks ${LOOKAHEAD * 1000} ms ahead and lowers the gain smoothly just before them, letting go over ${RELEASE * 1000} ms, so peaks stay under the ceiling, between samples too (true peak). −1 dBTP leaves room for MP3 and AAC encoders, which raise peaks a little. If the ceiling keeps a file from its target, the page says how loud it reached.`,
  },
  {
    term: "Normalize peaks",
    detail:
      "Makes each file louder or quieter so its highest true peak reaches the level chosen, with no limiter. Files keep their own loudness, so they will not sound equally loud.",
  },
  {
    term: "Make louder",
    detail: `Makes each file louder by up to ${MOST_LOUDER} dB, with the limiter. 6 dB doubles the height of the waveform; 10 dB sounds about twice as loud.`,
  },
  {
    term: "Loudness, range and peaks",
    detail:
      "The editor shows each file's loudness in LUFS, its loudness range in LU (how much it varies, as EBU Tech 3342 measures it) and its highest true peak in dBTP, for the whole file and for the part chosen, with its short-term loudness drawn under the waveform. The check measures the file written again.",
  },
]

const shaping: TutorialContent["options"] = [
  {
    term: "Equaliser",
    detail: `Raise or lower the bass (a shelf under ${BASS_HZ} Hz), the mid (around ${MID_HZ / 1000} kHz) and the treble (a shelf over ${TREBLE_HZ / 1000} kHz) by up to ${MOST_BAND} dB, and cut rumble under 80 or 120 Hz. Presets: ${Object.values(
      TONE_PRESETS
    )
      .map((preset) => `${preset.label} (${preset.says.replace(/\.$/, "")})`)
      .join("; ")}. These presets are KeepSimp's own choices.`,
  },
  {
    term: "Compressor",
    detail: `Turns the loudest moments down so loud and quiet parts sit closer together. ${Object.values(
      COMPRESSORS
    )
      .map((preset) => `${preset.label}: ${preset.says}`)
      .join(
        " "
      )} A compressed sound is quieter, so choose Normalize loudness to bring it back up. When the equaliser or compressor is on and the loudness is left as it is, a limiter keeps peaks under −1 dBTP.`,
  },
]

const silencing: TutorialContent["options"] = [
  {
    term: "Silence at the ends",
    detail: `Finds the silence at the start and the end of the sound as edited (under the level chosen, ${SILENCE_LEVELS.map((level) => `${level} dBFS`).join(", ")}) and keeps the sound between, leaving ${KEPT_EDGE} s of each. It is one step, undone like any other.`,
  },
  {
    term: "Long pauses",
    detail: `Shortens every pause inside the sound longer than the length chosen (${PAUSES.map((pause) => `${pause} s`).join(", ")}) to ${KEPT_PAUSE} s, all in one step. Each cut is faded, so nothing clicks.`,
  },
]

const splitting: TutorialContent["options"] = [
  {
    term: "Ways to split",
    detail: `Every few minutes (the last part is what is left), into a number of equal parts (2 to ${MOST_PARTS}), at markers you place, or at pauses longer than ${PAUSES.map((pause) => `${pause} s`).join(", ")} (each part ends at the middle of a pause, or the pauses can be left out). The parts are listed with their times before anything is written.`,
  },
  {
    term: "Markers",
    detail:
      "Put the playhead where a part should start and press Add a marker, or M on the waveform. Markers stay where they are in the file when you edit it; one in a part you cut out is not used. Remove one with its ×.",
  },
  {
    term: "The parts",
    detail:
      "Each part is the file as you edited it, cut to its part to the sample, in the format and with the settings chosen, and checked like any result. They are named after the file with a number (talk - 01, talk - 02 …), and can be downloaded one by one or as one ZIP. The file itself is never changed.",
  },
]

const combining: TutorialContent["options"] = [
  {
    term: "The order",
    detail:
      "Files join in the order of the list; move each up or down with its arrows. Each joins as you edited it, so trim, fade or cut each one first if you like.",
  },
  {
    term: "Between files",
    detail: `Straight on, with ${GAPS.map((gap) => `${gap}`).join(", ")} s of silence, or crossfaded over ${CROSSFADES.map((crossfade) => `${crossfade}`).join(", ")} s: the end of one fades out as the next fades in, at equal power so the loudness does not dip. A crossfade is never longer than half of either file.`,
  },
  {
    term: "Matching files",
    detail:
      "Files of different rates and channels are made the same (the first file's rate unless you choose one, and stereo when any is stereo). Choose Normalize loudness and each file is measured and brought to the target by itself, so they come out equally loud; one limiter keeps the peaks of the whole under the ceiling.",
  },
  {
    term: "Chapters",
    detail:
      "An MP3 or M4A gets a chapter for each file, named after it: ID3 chapters in an MP3, which most players and podcast apps read; a Nero chapter list in an M4A, which VLC, FFmpeg and foobar2000 read. Apple's own apps read chapters of another kind, which is not written.",
  },
]

const editing: TutorialContent["options"] = [
  {
    term: "Choosing a part",
    detail:
      "Drag across the waveform, drag a selection's edge to move it, or type its start and end (as 7.25, 1:07.25 or 1:02:03). On the waveform, I and O start and end the selection at the playhead. Zoom in to choose to the millisecond: the buttons, Ctrl or ⌘ with the wheel, or a trackpad's pinch.",
  },
  {
    term: "Keep only this, Cut out",
    detail: `Keep only this keeps the selection and drops the rest; Cut out takes the selection away and closes the gap. Wherever the sound was cut, it fades out and in over ${JOIN_FADE * 1000} milliseconds, too short to hear as a fade and enough to take away the click a cut can make.`,
  },
  {
    term: "Fades",
    detail:
      "Choose the part to fade over and press Fade in or Fade out. Even fades at a steady rate; Smooth keeps more of the sound until late; S-curve starts and ends softly.",
  },
  {
    term: "Silence and volume",
    detail: `Silence makes the selection silent and keeps its length. Volume makes the selection, or all of it when nothing is chosen, louder or quieter by up to ${MOST_GAIN} dB. Louder can clip: listen before you download. Measuring and matching loudness comes in a later version.`,
  },
  {
    term: "Edits and undo",
    detail:
      "Your file is never changed. Each edit is a step in the list; the result is written from your file and the steps, so you can undo, redo or start again at any time. Each file in the list keeps its own edits; the format settings are shared.",
  },
  {
    term: "Playing",
    detail:
      "Play and Play the selection play the sound as edited: cut parts are skipped and fades heard. This is a preview played from your file; the file written is exact to the sample and is checked. Loop repeats what is playing.",
  },
  {
    term: "Encoded again",
    detail:
      "An edited sound is always encoded again: MP3 and AAC hold sound in blocks of about a fortieth of a second, so copying them could not cut where you chose. FLAC and WAV keep every sample.",
  },
  ...keys,
]

const editor: TutorialContent = {
  name: "How to edit and convert audio with KeepSimp",
  description:
    "Trim, cut, fade and change the volume of sound, convert it between MP3, M4A (AAC), Opus, FLAC and WAV, make ringtones and take the sound out of videos, many files at once, in your browser. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your files",
      text: "Drop them, choose them or paste them: MP3, M4A, Opus, Ogg, FLAC, WAV, AIFF, or videos. Up to 50 at once.",
    },
    {
      title: "Edit the sound",
      text: "Choose a part on the waveform, then keep it, cut it out, silence it, fade it or change its volume. Each file keeps its own edits.",
    },
    {
      title: "Choose the format",
      text: "MP3, M4A, Opus, FLAC, WAV or an iPhone ringtone, a quality, and if you like a sample rate, mono or stereo, and a file size limit.",
    },
    {
      title: "Listen, check and download",
      text: "Each file is written as soon as it is read or edited, and checked. Download one, or everything as one ZIP.",
    },
  ],
  options: [
    ...editing,
    ...silencing,
    ...splitting,
    ...combining,
    ...leveling,
    ...shaping,
    ...options,
  ],
  guideHref: "/blog/trim-audio-without-uploading/",
}

const trimming: TutorialContent = {
  name: "How to trim audio with KeepSimp",
  description:
    "Cut a song, voice note or podcast to the part you want, to the millisecond, with fades, in your browser. Every edit can be undone. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add the file",
      text: "Drop it, choose it or paste it: MP3, M4A, Opus, Ogg, FLAC, WAV, AIFF, or a video.",
    },
    {
      title: "Choose the part",
      text: "Drag across the waveform, or type the start and end. Zoom in to be exact, and play the selection to hear it.",
    },
    {
      title: "Keep it or cut it out",
      text: "Keep only this, or Cut out, and fade the ends if you like. Undo whenever you change your mind.",
    },
    {
      title: "Download",
      text: "The result is written in the file's own format, unless you choose another, and checked before you download it.",
    },
  ],
  options: [...editing, ...silencing, ...options],
  guideHref: "/blog/trim-audio-without-uploading/",
}

const ringtones: TutorialContent = {
  name: "How to make a ringtone with KeepSimp",
  description:
    "Make an iPhone ringtone (M4R) or an Android ringtone (MP3) from any song in your browser, faded at its end. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add a song",
      text: "Drop it, choose it or paste it: MP3, M4A, FLAC, WAV or the sound of a video.",
    },
    {
      title: "Choose the part",
      text: "Drag across the waveform, or put the playhead where the ringtone should start.",
    },
    {
      title: "Make the ringtone",
      text: `Choose the phone and press Make the ringtone: the part is cut to ${RINGTONES.iphone.seconds} seconds for an iPhone (${RINGTONES.alert.seconds} for an alert tone), faded at its ends and written as M4R, or as MP3 for Android.`,
    },
    {
      title: "Put it on your phone",
      text: "Download it; the page says how to put it on an iPhone or an Android phone.",
    },
  ],
  options: [
    {
      term: "Ringtone lengths",
      detail: `An iPhone takes a ringtone of at most ${RINGTONES.iphone.seconds} seconds and an alert tone of at most ${RINGTONES.alert.seconds}, as M4R (AAC sound in MP4). An Android phone takes an MP3 of any length; the maker takes ${RINGTONES.android.seconds} seconds.`,
    },
    {
      term: "On an iPhone",
      detail:
        "With a Mac, connect the iPhone, open it in Finder and drag the M4R onto its window. With Windows, use iTunes or the Apple Devices app and drag it onto the iPhone under Tones. It then appears in Settings, Sounds & Haptics.",
    },
    {
      term: "On an Android phone",
      detail:
        "Copy the MP3 into the phone's Ringtones folder, or open Settings, Sound, Ringtone and add it there. The menus differ a little from one maker to another.",
    },
    ...editing,
    ...options,
  ],
  guideHref: "/blog/make-a-ringtone/",
}

export function AudioEditorTutorial() {
  return <ToolTutorial content={editor} />
}

export function AudioTrimmerTutorial() {
  return <ToolTutorial content={trimming} />
}

export function RingtoneTutorial() {
  return <ToolTutorial content={ringtones} />
}

const normalizing: TutorialContent = {
  name: "How to normalize audio loudness with KeepSimp",
  description:
    "Bring audio files to the same loudness in your browser, −14 LUFS for Spotify or another target, with a true-peak limiter. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your files",
      text: "Drop them, choose them or paste them: MP3, M4A, Opus, FLAC, WAV, AIFF or videos. Up to 50 at once.",
    },
    {
      title: "Choose the loudness",
      text: "−14 LUFS for Spotify, −16 for Apple Podcasts, −23 for broadcast, or your own; and the peak ceiling.",
    },
    {
      title: "Let each file be measured",
      text: "Each is measured as it will be written and made louder or quieter to reach the target; the limiter holds its peaks.",
    },
    {
      title: "Check and download",
      text: "Each file written is measured again; the page says what it reached. Download one, or all as a ZIP.",
    },
  ],
  options: [...leveling, ...shaping, ...options],
  guideHref: "/blog/normalize-audio-loudness/",
}

const boosting: TutorialContent = {
  name: "How to make audio louder with KeepSimp",
  description:
    "Make a quiet recording, song or video's sound louder in your browser, with a limiter so nothing clips. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add the file",
      text: "Drop it, choose it or paste it: MP3, M4A, Opus, FLAC, WAV, AIFF or a video.",
    },
    {
      title: "Choose how much louder",
      text: "6 dB is chosen for you; up to 30. The limiter keeps the loudest moments under the ceiling.",
    },
    {
      title: "Listen",
      text: "The page says how much louder it was made and how much the limiter took off the loudest moments.",
    },
    {
      title: "Download",
      text: "In the file's own format unless you choose another, checked before you download it.",
    },
  ],
  options: [...leveling, ...options],
  guideHref: "/blog/make-audio-louder/",
}

export function NormalizeTutorial() {
  return <ToolTutorial content={normalizing} />
}

export function BoosterTutorial() {
  return <ToolTutorial content={boosting} />
}

const splitter: TutorialContent = {
  name: "How to split audio into parts with KeepSimp",
  description:
    "Split a recording, podcast or mix into parts in your browser: by time, into equal parts, at markers or at its pauses. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add the file",
      text: "Drop it, choose it or paste it: MP3, M4A, Opus, FLAC, WAV, AIFF or a video.",
    },
    {
      title: "Choose how to split it",
      text: "Every few minutes, into equal parts, at markers you place on the waveform, or at its pauses. Trim or edit it first if you like.",
    },
    {
      title: "Split",
      text: "The parts are listed with their times; press Split, and each is written and checked.",
    },
    {
      title: "Download",
      text: "Each part on its own, or all of them as one ZIP, named in order.",
    },
  ],
  options: [...splitting, ...editing, ...silencing, ...options],
  guideHref: "/blog/split-audio-into-parts/",
}

export function SplitterTutorial() {
  return <ToolTutorial content={splitter} />
}

const joiner: TutorialContent = {
  name: "How to join audio files with KeepSimp",
  description:
    "Join sound files into one in your browser, in the order you set, straight on, with silence between or crossfaded, with a chapter for each. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add the files",
      text: "Drop them, choose them or paste them: MP3, M4A, Opus, FLAC, WAV, AIFF or the sound of videos.",
    },
    {
      title: "Put them in order",
      text: "Move each up or down. Trim or edit any of them first if you like.",
    },
    {
      title: "Choose how they meet",
      text: "Straight on, with silence between or crossfaded; the format, and Normalize loudness to make them match.",
    },
    {
      title: "Join and download",
      text: "The joined file is written, checked and ready, with a chapter for each file in an MP3 or M4A.",
    },
  ],
  options: [...combining, ...options],
  guideHref: "/blog/join-audio-files/",
}

export function JoinerTutorial() {
  return <ToolTutorial content={joiner} />
}
