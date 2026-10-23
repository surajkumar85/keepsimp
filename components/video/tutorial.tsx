import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"
import { lengthTolerance } from "@/lib/video/check"
import {
  LEAST_BITS_PER_PIXEL,
  MOST_PASSES,
  SIZE_STEPS,
} from "@/lib/video/target"
import {
  HIGH_BITRATES,
  LIMIT_SIZES,
  KEYFRAME_SECONDS,
  PRESET_SHARE,
} from "@/lib/video/settings"
import { MAX_FILES } from "@/lib/video/queue"

const mbit = (kbit: number) =>
  `${(kbit / 1000).toLocaleString("en", { maximumFractionDigits: 1 })}`

const options: TutorialContent["options"] = [
  {
    term: "Copied or encoded again",
    detail:
      "When the picture already has a codec the new format holds and plays everywhere, and nothing about it is to change, it is copied as it is: nothing is lost, and an hour of video takes seconds. Choosing a quality, a smaller size, a lower frame rate or another codec means it is encoded again by your browser's own encoder (WebCodecs). The page says which, and why, under the player.",
  },
  {
    term: "MP4",
    detail:
      "Plays everywhere. The picture is H.264 unless you choose HEVC, AV1 or VP9; VP9 and AV1 in an MP4 are only copied when you choose them, as some players lack them. Sound is AAC or MP3. The file's index is put at its start (fast start), as YouTube asks, so it can play before it has all loaded.",
  },
  {
    term: "WebM",
    detail:
      "The web's own format: VP9, AV1 or VP8 with Opus sound. It plays in every browser and on Android, but not in QuickTime or older Apple software.",
  },
  {
    term: "MOV and MKV",
    detail:
      "MOV is Apple's own, for Final Cut, iMovie and QuickTime: H.264 or HEVC. MKV holds almost any picture and sound as it is, so it is the format to choose when a file must not be encoded again. MPEG-TS files are read and written as MP4.",
  },
  {
    term: "Quality",
    detail: `High is YouTube's recommended upload bitrate for the size and frame rate: for H.264, ${HIGH_BITRATES.map((row) => `${row.side}p ${mbit(row.normal)} Mbit/s (${mbit(row.fast)} over 30 fps)`).join(", ")}. Balanced is ${PRESET_SHARE.balanced * 100}% of that and Small ${PRESET_SHARE.small * 100}%, KeepSimp's own choices. HEVC and VP9 get 60% of H.264's bitrate and AV1 40%, for the same look. A file is never given more than it holds. Custom takes a bitrate of your own. A keyframe is written every ${KEYFRAME_SECONDS} seconds.`,
  },
  {
    term: "Size limit",
    detail: `Each file is written to fit under the size chosen (${LIMIT_SIZES.join(", ")} MB, half or a quarter of its own size, or a size of your own). The sound gets its share first (converted smaller when it would take more than a fifth), then the picture gets the rest as its bitrate. When that leaves fewer than ${LEAST_BITS_PER_PIXEL} bits for each pixel of each frame in H.264 (the share HandBrake's presets for sharing work to), more than 30 frames a second become 30, then the size steps down (${SIZE_STEPS.join("p, ")}p). Browser encoders do not always keep to a bitrate, so each pass is watched as it is written, and a file that misses is written again with a corrected bitrate, ${MOST_PASSES} passes at most; a result is never offered as fitting when it does not. A file already under its limit is copied as it is. If a limit is too small even at the smallest size, the page says how small the video can be made.`,
  },
  {
    term: "Size and frame rate",
    detail:
      "Size sets the shorter side at most (720p is 1280 × 720 for a wide video, 720 × 1280 for an upright one), keeping the shape. Frame rate sets the most frames a second. Neither is ever raised: a smaller video is not made larger, and a 24 fps film stays 24.",
  },
  {
    term: "Turn and mirror",
    detail:
      "MP4 and MOV carry a turn as a setting that players follow, so turning a copied video is instant and loses nothing. In WebM and MKV, and whenever the picture is encoded again, it is turned as it is drawn, so every player shows it upright.",
  },
  {
    term: "Sound",
    detail:
      "Keep copies the sound as it is when the format plays it everywhere, and converts it otherwise (to AAC for MP4 and MOV, to Opus for WebM and MKV). Convert always converts it. Converted sound starts exactly with the picture: an encoder puts a short run of samples before the sound, and the file says to skip it (an edit list in MP4 and MOV, Opus's own header in WebM and MKV). Leave out writes the picture alone. To keep only the sound, use the Audio extractor.",
  },
  {
    term: "The check",
    detail: `Every video written is opened again: its format, its picture's codec and size, its frame rate and its sound are held to what was asked, its length to the original's within ${lengthTolerance(30).toFixed(2)} s at 30 fps, and its first and last frames and its sound are decoded. If something is not as asked, the page says what.`,
  },
  {
    term: "Codecs your browser cannot write",
    detail:
      "Browsers differ: HEVC is written only on some hardware and in Safari, AV1 not in Safari, and Firefox on Android writes none. KeepSimp asks your browser what it can write at each size and offers what it can; copying never needs an encoder. HDR video is written without tone mapping, and a file's own subtitles and chapters are not kept.",
  },
  {
    term: "Long videos and privacy",
    detail: `Files are read a piece at a time and results written to your browser's private storage on this device, not held in memory, so videos of any length work; up to ${MAX_FILES} at once. Nothing is uploaded. The results are removed from that storage when you close the page, or, if the browser stops before it can, the next time the workspace opens.`,
  },
]

const editor: TutorialContent = {
  name: "How to convert video with KeepSimp's video editor",
  description:
    "Convert videos to MP4, WebM, MOV or MKV in your browser, change their size, frame rate and quality, turn them or take the sound out. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your videos",
      text: `Drop them or choose them: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once.`,
    },
    {
      title: "Choose the format",
      text: "MP4 plays everywhere; WebM is for the web; MOV for Apple's apps; MKV keeps anything as it is.",
    },
    {
      title: "Change what you need",
      text: "Quality, size, frame rate, a turn, or the sound. The sentence under the player says what will be done and why.",
    },
    {
      title: "Download",
      text: "Each video is checked before it is offered. Download one, or all of them as a ZIP.",
    },
  ],
  options,
  guideHref: "/blog/convert-video-without-uploading/",
}

const converting: TutorialContent = {
  ...editor,
  name: "How to convert video to MP4, WebM, MOV or MKV",
  description:
    "Convert MOV, WebM, MKV and MPEG-TS videos to MP4 and back in your browser, copied as they are wherever nothing has to change. Nothing is uploaded.",
  guideHref: "/blog/convert-mov-webm-mkv-to-mp4/",
}

const compressing: TutorialContent = {
  ...editor,
  name: "How to compress a video to a size with KeepSimp",
  description:
    "Make a video smaller in your browser, to fit under 8, 10 or 25 MB or half its size, with the bitrate, frame rate and size chosen for it. Nothing is uploaded.",
  steps: [
    {
      title: "Add your videos",
      text: `Drop them or choose them: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once.`,
    },
    {
      title: "Choose a size limit",
      text: "8, 10, 25, 50 or 100 MB, half or a quarter of each file, or your own. Or leave it and choose a quality.",
    },
    {
      title: "Read what will be done",
      text: "The sentence under the player says the bitrate, and the frame rate and size if they must come down.",
    },
    {
      title: "Download",
      text: "Each video is checked against its limit and opened again before it is offered.",
    },
  ],
  guideHref: "/blog/compress-video-to-a-size/",
}

export function VideoCompressorTutorial() {
  return <ToolTutorial content={compressing} />
}

export function VideoEditorTutorial() {
  return <ToolTutorial content={editor} />
}

export function VideoConverterTutorial() {
  return <ToolTutorial content={converting} />
}
