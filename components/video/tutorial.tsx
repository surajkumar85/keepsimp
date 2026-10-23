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
  FASTEST_SPEED,
  LOGO_SIZES,
  SHAPES,
  SLOWEST_SPEED,
} from "@/lib/video/settings"
import { MAX_FILES } from "@/lib/video/queue"
import { TARGETS } from "@/lib/audio/level"
import { TRACK_TAIL, TRACK_VOLUMES } from "@/lib/video/soundtrack"
import { shortcutGroups } from "@/lib/video/shortcuts"
import { JOIN_FADE } from "@/lib/audio/edits"

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
    detail: `Each file is written to fit under the size chosen (${LIMIT_SIZES.join(", ")} MB, half or a quarter of its own size, or a size of your own). The sound gets its share first (converted smaller when it would take more than a fifth), then the picture gets the rest as its bitrate. When that leaves fewer than ${LEAST_BITS_PER_PIXEL} bits for each pixel of each frame in H.264 (the share HandBrake's presets for sharing work to), more than 30 frames a second become 30, then the size steps down (${SIZE_STEPS.join("p, ")}p). Browser encoders do not always keep to a bitrate, so each pass is watched as it is written, and a file that misses is written again with a corrected bitrate, ${MOST_PASSES} passes at most. Some encoders will not go below a certain bitrate whatever they are asked (Firefox's H.264 on Linux, for one); when a pass comes out far over what it was asked for, the next is made smaller instead, with the bits for each pixel kept, and the page says so; a result is never offered as fitting when it does not. A file already under its limit is copied as it is. If a limit is too small even at the smallest size, the page says how small the video can be made.`,
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
    term: "Shape",
    detail: `Cuts each picture to ${SHAPES.join(", ")} around its middle, after any turn: 9:16 for Reels, Shorts and TikTok, 1:1 for square posts, 4:5 for portrait posts. A picture already within a hundredth of the shape is left whole. Cropping means the picture is encoded again.`,
  },
  {
    term: "Crop by hand",
    detail:
      "Crop by hand draws a box over the picture: drag it, drag its corners, or focus it and use the arrow keys (Shift resizes). Lock it to a shape or leave it free, then Use this crop. Each video keeps its own box, which takes the place of the shape setting for it; the turn chosen is applied first.",
  },
  {
    term: "Speed",
    detail: `From ${SLOWEST_SPEED} to ${FASTEST_SPEED} times. Faster keeps the frame rate, so frames are left out; slower plays every frame for longer, so a 30 fps video at half speed has 15 frames a second. The sound is stretched by the audio editor's own engine (WSOLA), which keeps its pitch. Both are encoded again.`,
  },
  {
    term: "Loudness",
    detail: `Makes the sound ${TARGETS.map((target) => `${target.label} (${target.for})`).join(", ")} as BS.1770 measures it, with the audio editor's own meter. Each sound is measured as it will be written (after trims, speed and fades), made louder or quieter, and its true peaks held under −1 dBTP by the audio editor's limiter; the result is measured again and held to the target within 1 LU, unless the limiter had to keep it quieter, which the page says. The picture is not touched by it.`,
  },
  {
    term: "Text and logo",
    detail: `Text along the top and the bottom of the picture is written with the animation converter's own captions: the site's Outfit, wrapped to fit, small, medium or large, white or black with an outline of the other colour, for the whole video or between two times of the result. A logo (PNG, JPEG, WebP, GIF or AVIF) sits in a corner or the middle, ${LOGO_SIZES.join(", ")}% of the picture's width in its own shape, solid or see-through. Both are drawn on every frame, so the picture is encoded again. A logo marks a video; it does not stop it being copied.`,
  },
  {
    term: "Soundtrack",
    detail: `Add a soundtrack puts the sound of another file (music, a voice-over, or a video's sound) under every video: in place of its own sound, or mixed under it at a volume (${TRACK_VOLUMES.filter(Boolean).join(", ")} dB, or as it is). A shorter soundtrack plays again from its start until the video ends, unless that is turned off, and one still playing at the end fades out over ${TRACK_TAIL} s. It starts with the video, after any trim, and takes the fades and loudness chosen. The picture is copied as it is when nothing else changes it; only the sound is encoded.`,
  },
  {
    term: "Fades",
    detail:
      "Fade in from black and silence at the start, and out to them at the end, over the seconds chosen, after any trim and speed change. Both picture and sound are encoded again.",
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

/** The keys, as the help says them: made from the list the trimmer answers to. */
const keys = shortcutGroups().map((group) => ({
  term: `Keys: ${group.title.toLowerCase()}`,
  detail: `${group.shortcuts
    .map(
      (shortcut) =>
        `${shortcut.ways.map((way) => way.join(" + ")).join(" or ")}: ${shortcut.does}.`
    )
    .join(" ")} The keys work while the trim panel has the focus.`,
}))

const trimming: TutorialContent["options"] = [
  {
    term: "Keep and cut",
    detail:
      "Choose a stretch with Start and End (type a time such as 1:07.25, drag, or press I and O at the playhead). Keep the selection keeps only that stretch of what is kept now; Cut it out takes it away. Do either as often as you like: the parts kept are shown on the timeline and listed under it, and Undo and Redo go back and forth. Play what is kept plays the parts one after another, stepping over what is cut.",
  },
  {
    term: "Lossless",
    detail:
      "The picture is copied as it is, so nothing is lost and an hour of video is cut in seconds. A video holds a whole picture only now and then (a keyframe, marked under the timeline); the frames between are written as changes from it, so a copy can begin and end only at a keyframe. An MP4 or MOV with one part kept still starts exactly where you asked: the file says where to start playing, and its earlier frames are kept only to be decoded. Otherwise each part is moved out to the keyframes around it, and the page says how much more is kept. Several parts are joined one after another into one file.",
  },
  {
    term: "Exact",
    detail: `Cuts to the frame, and the sound to the sample, by encoding the picture again (with the quality chosen in the settings; Original keeps its bitrate). Where parts are joined, the sound fades over ${JOIN_FADE * 1000} ms on each side, so a cut does not click. Lossless becomes exact by itself when something else means the picture is encoded anyway, such as a new size or format.`,
  },
  {
    term: "Split into files",
    detail:
      "Mark where to split with Split here (or S at the playhead), or split every so many seconds, then Make files: each piece becomes a file of its own in the list, named -part-1, -part-2 and so on, holding what is kept in it, and is written and checked like any trimmed video, lossless or exact as chosen. Download them one by one or as a ZIP.",
  },
  {
    term: "Save a frame",
    detail:
      "Saves the frame at the playhead as a PNG, read from the file itself at the video's full size, not from the player.",
  },
  ...keys,
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
      text: "Trim it, or change its quality, size, frame rate, turn or sound. The sentence under the player says what will be done and why.",
    },
    {
      title: "Download",
      text: "Each video is checked before it is offered. Download one, or all of them as a ZIP.",
    },
  ],
  options: [...options, ...trimming],
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

const cutting: TutorialContent = {
  ...editor,
  name: "How to trim a video with KeepSimp",
  description:
    "Cut a video to the parts you want in your browser, without encoding or to the frame, and save any frame as a picture. Nothing is uploaded.",
  steps: [
    {
      title: "Add your video",
      text: `Drop it or choose it: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once, each trimmed on its own.`,
    },
    {
      title: "Choose what to keep",
      text: "Set a start and an end, then keep that part or cut it out. Do it again for more cuts.",
    },
    {
      title: "Lossless or exact",
      text: "Lossless copies the picture and cuts at keyframes; Exact cuts to the frame and encodes it again.",
    },
    {
      title: "Download",
      text: "The trimmed video is opened again and checked before it is offered, its length too.",
    },
  ],
  options: [...trimming, ...options],
  guideHref: "/blog/trim-video-without-losing-quality/",
}

const cropping: TutorialContent = {
  ...editor,
  name: "How to crop a video to 9:16, square or 4:5",
  description:
    "Crop videos for Reels, Shorts, TikTok or feeds in your browser, around the middle of the picture. Nothing is uploaded.",
  steps: [
    {
      title: "Add your videos",
      text: `Drop them or choose them: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once.`,
    },
    {
      title: "Choose the shape",
      text: "9:16 is chosen to start with; 1:1, 4:5, 16:9 and 4:3 are there too, with a turn first if a video lies on its side.",
    },
    {
      title: "Download",
      text: "Each video is cropped, checked and offered: one by one or as a ZIP.",
    },
  ],
  guideHref: "/blog/crop-video-to-9-16-or-square/",
}

const speeding: TutorialContent = {
  ...editor,
  name: "How to speed up or slow down a video",
  description:
    "Change a video's speed in your browser, from half to twice as fast, the sound keeping its pitch. Nothing is uploaded.",
  steps: [
    {
      title: "Add your videos",
      text: `Drop them or choose them: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once.`,
    },
    {
      title: "Choose the speed",
      text: "Twice as fast is chosen to start with; half, three quarters, 1.25 and 1.5 times are there too. Add fades if you like.",
    },
    {
      title: "Download",
      text: "Each video is written at its new length, checked and offered.",
    },
  ],
  guideHref: "/blog/speed-up-or-slow-down-a-video/",
}

const muting: TutorialContent = {
  ...editor,
  name: "How to remove the sound from a video",
  description:
    "Take the sound out of videos in your browser, the picture copied as it is so nothing is lost. Nothing is uploaded.",
  steps: [
    {
      title: "Add your videos",
      text: `Drop them or choose them: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once.`,
    },
    {
      title: "That is all",
      text: "The sound is left out as soon as each is read, and the picture copied as it is: no encoding, no loss.",
    },
    {
      title: "Download",
      text: "One by one or as a ZIP, each checked to have its picture and no sound.",
    },
  ],
  guideHref: "/blog/remove-sound-from-a-video/",
}

export function CropVideoTutorial() {
  return <ToolTutorial content={cropping} />
}

export function VideoSpeedTutorial() {
  return <ToolTutorial content={speeding} />
}

const scoring: TutorialContent = {
  ...editor,
  name: "How to add music to a video",
  description:
    "Put music or a voice-over under your videos in your browser, in place of their sound or mixed under it. Nothing is uploaded.",
  steps: [
    {
      title: "Add your videos",
      text: `Drop them or choose them: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once.`,
    },
    {
      title: "Add a soundtrack",
      text: "MP3, M4A, WAV, FLAC, Ogg or the sound of another video. It goes under every video.",
    },
    {
      title: "In place of the sound, or under it",
      text: "Choose how loud it is under the video's own sound, and whether it plays again to fill the video.",
    },
    {
      title: "Download",
      text: "Each video is written with its new sound, checked and offered.",
    },
  ],
  guideHref: "/blog/add-music-to-a-video/",
}

const titling: TutorialContent = {
  ...editor,
  name: "How to add text or a logo to a video",
  description:
    "Write a title or caption on your videos and put a logo in a corner, in your browser. Nothing is uploaded.",
  steps: [
    {
      title: "Add your videos",
      text: `Drop them or choose them: MP4, MOV, WebM, MKV or MPEG-TS, of any length. Up to ${MAX_FILES} at once.`,
    },
    {
      title: "Write the text",
      text: "Along the top, the bottom or both, in a size and colour that reads on the picture, for the whole video or a few seconds.",
    },
    {
      title: "Add a logo",
      text: "A PNG with a clear background works best; choose its corner, width and how solid it is.",
    },
    {
      title: "Download",
      text: "Each video is written with them, checked and offered.",
    },
  ],
  guideHref: "/blog/add-text-or-a-logo-to-a-video/",
}

export function TextTutorial() {
  return <ToolTutorial content={titling} />
}

export function MusicTutorial() {
  return <ToolTutorial content={scoring} />
}

export function MuteVideoTutorial() {
  return <ToolTutorial content={muting} />
}

export function VideoTrimmerTutorial() {
  return <ToolTutorial content={cutting} />
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
