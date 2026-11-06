// The emoji picker's set: one line per emoji, the emoji first, then the words a search matches.
// Grouped by category in the order the picker shows them.

const RAW: Record<string, string> = {
  Smileys: `
😀 grin happy smile
😃 smile happy joy
😄 laugh happy smile
😁 beam grin
😆 laughing satisfied
😅 sweat relief phew
🤣 rofl rolling laugh
😂 joy tears laugh lol
🙂 slight smile
🙃 upside down silly
😉 wink
😊 blush smile
😇 angel innocent halo
🥰 love hearts adore
😍 heart eyes love
🤩 star struck wow
😘 kiss blow
😋 yum tasty
😛 tongue
😜 wink tongue crazy
🤪 zany crazy
🤑 money rich
🤗 hug hugging
🤭 oops giggle hand
🤫 shush quiet secret
🤔 think thinking hmm
🤐 zipper mouth secret
🤨 raised eyebrow skeptical
😐 neutral meh
😑 expressionless blank
😶 no mouth speechless
😏 smirk
😒 unamused
🙄 eye roll
😬 grimace awkward
😮‍💨 exhale relief
🤥 lying pinocchio
😌 relieved calm
😔 pensive sad
😪 sleepy
🤤 drool
😴 sleeping tired zzz
😷 mask sick
🤒 thermometer sick ill
🤕 bandage hurt
🤢 nauseated sick
🤮 vomit
🥵 hot heat
🥶 cold freezing
🥴 woozy dizzy
😵 dizzy knocked
🤯 mind blown exploding
🤠 cowboy
🥳 party celebrate birthday
🥸 disguise
😎 cool sunglasses
🤓 nerd geek
🧐 monocle curious
😕 confused
😟 worried
🙁 frown
😮 open mouth wow
😯 hushed surprised
😲 astonished shocked
😳 flushed embarrassed
🥺 pleading puppy eyes
😦 frowning open
😧 anguished
😨 fearful scared
😰 anxious sweat
😥 sad relieved
😢 cry sad tear
😭 sob crying loud
😱 scream fear
😖 confounded
😣 persevere
😞 disappointed
😓 downcast sweat
😩 weary
😫 tired
🥱 yawn bored
😤 triumph huff
😡 angry rage pout
😠 angry mad
🤬 cursing swear
😈 devil smiling
💀 skull dead
💩 poop
🤡 clown
👻 ghost
👽 alien
🤖 robot bot
😺 cat smile
😹 cat joy
😻 cat heart eyes
🙈 see no evil monkey
🙉 hear no evil
🙊 speak no evil
`,
  People: `
👋 wave hello hi bye
🤚 raised back hand
✋ raised hand stop high five
🖖 vulcan
👌 ok perfect
🤌 pinched fingers
🤏 pinch small
✌️ peace victory
🤞 crossed fingers luck
🤟 love you
🤘 rock horns
🤙 call me shaka
👈 point left
👉 point right
👆 point up
👇 point down
☝️ index up
👍 thumbs up yes like +1 approve
👎 thumbs down no dislike -1
✊ fist raised
👊 fist bump punch
🤛 left fist
🤜 right fist
👏 clap applause bravo
🙌 raised hands hooray
👐 open hands
🤲 palms up
🤝 handshake deal agree
🙏 pray please thanks
✍️ writing
💅 nail polish
💪 muscle strong flex
🧠 brain smart
👀 eyes look watching
👁️ eye
👄 mouth
👶 baby
🧑 person
👩 woman
👨 man
🧑‍💻 technologist developer coder
🧑‍🎨 artist designer
🧑‍🚀 astronaut
🧑‍🍳 cook chef
🧑‍🏫 teacher
🕵️ detective
🥷 ninja
🦸 superhero
🧙 mage wizard
🧟 zombie
🙋 raising hand question
🙆 ok gesture
🙅 no gesture
🤷 shrug dunno
🤦 facepalm
🙇 bow sorry
💁 tipping hand
🧘 yoga calm meditate
🏃 running run
🚶 walking
💃 dancing dance
🕺 man dancing
👯 party people
`,
  Nature: `
🐶 dog puppy
🐱 cat kitten
🐭 mouse
🐹 hamster
🐰 rabbit bunny
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🐯 tiger
🦁 lion
🐮 cow
🐷 pig
🐸 frog
🐵 monkey
🐔 chicken
🐧 penguin
🐦 bird
🦆 duck
🦅 eagle
🦉 owl
🦇 bat
🐺 wolf
🐴 horse
🦄 unicorn
🐝 bee honeybee
🐛 bug caterpillar
🦋 butterfly
🐌 snail slow
🐞 ladybug
🐢 turtle slow
🐍 snake
🦖 t rex dinosaur
🐙 octopus
🦀 crab
🐠 fish tropical
🐬 dolphin
🐳 whale
🦈 shark
🐘 elephant
🦒 giraffe
🐿️ chipmunk
🌵 cactus
🎄 christmas tree
🌲 evergreen tree
🌳 tree
🌴 palm tree
🌱 seedling grow sprout
🌿 herb
☘️ shamrock
🍀 four leaf clover luck
🍁 maple leaf
🍂 fallen leaves autumn
🌷 tulip flower
🌹 rose
🌻 sunflower
🌸 cherry blossom
💐 bouquet flowers
🌞 sun face
🌝 full moon face
🌚 new moon face
🌙 crescent moon night
⭐ star
🌟 glowing star
✨ sparkles magic new
⚡ zap lightning fast
🔥 fire hot lit
🌈 rainbow
☀️ sun sunny
⛅ partly cloudy
☁️ cloud
🌧️ rain
⛈️ storm thunder
❄️ snowflake cold
☃️ snowman
💧 droplet water
🌊 wave ocean
🌍 earth globe world
`,
  Food: `
🍏 green apple
🍎 apple red
🍐 pear
🍊 orange tangerine
🍋 lemon
🍌 banana
🍉 watermelon
🍇 grapes
🍓 strawberry
🫐 blueberries
🍒 cherries
🍑 peach
🥭 mango
🍍 pineapple
🥥 coconut
🥝 kiwi
🍅 tomato
🥑 avocado
🌶️ hot pepper spicy
🌽 corn
🥕 carrot
🥐 croissant
🍞 bread
🧀 cheese
🥚 egg
🍳 cooking fried egg
🥓 bacon
🍔 burger hamburger
🍟 fries
🍕 pizza
🌭 hot dog
🥪 sandwich
🌮 taco
🌯 burrito
🥗 salad
🍝 pasta spaghetti
🍜 ramen noodles
🍣 sushi
🍱 bento
🍤 shrimp
🍚 rice
🍿 popcorn
🍩 donut doughnut
🍪 cookie
🎂 birthday cake
🍰 cake shortcake
🧁 cupcake
🍫 chocolate
🍬 candy
🍭 lollipop
🍦 ice cream
☕ coffee tea hot
🍵 tea matcha
🧃 juice box
🥤 soda cup
🧋 bubble tea boba
🍺 beer
🍻 cheers beers
🥂 champagne toast cheers
🍷 wine
🍸 cocktail
🍾 bottle popping celebrate
🧊 ice
`,
  Activities: `
⚽ soccer football
🏀 basketball
🏈 american football
⚾ baseball
🎾 tennis
🏐 volleyball
🏓 ping pong
🏸 badminton
🥊 boxing
⛳ golf
🏹 archery
🎣 fishing
🛹 skateboard
⛷️ ski
🏂 snowboard
🏋️ weight lifting gym
🚴 cycling bike
🏆 trophy win winner
🥇 gold medal first
🥈 silver medal second
🥉 bronze medal third
🏅 medal
🎖️ military medal
🎗️ ribbon
🎫 ticket
🎪 circus
🎭 theater
🎨 art palette paint
🎬 clapper film movie
🎤 microphone sing karaoke
🎧 headphones music
🎼 score music
🎹 piano keyboard
🥁 drum
🎷 saxophone
🎸 guitar
🎻 violin
🎲 dice game
♟️ chess
🎯 target bullseye goal
🎳 bowling
🎮 video game controller
🧩 puzzle piece
🎉 tada party celebrate hooray
🎊 confetti
🎈 balloon
🎁 gift present
`,
  Travel: `
🚗 car
🚕 taxi
🚌 bus
🏎️ race car fast
🚓 police car
🚑 ambulance
🚒 fire engine
🚚 truck delivery
🚜 tractor
🛵 scooter
🚲 bicycle
🛴 kick scooter
🚨 siren alert alarm
🚥 traffic light
🚧 construction wip
⚓ anchor
⛵ sailboat
🚤 speedboat
🛳️ ship
✈️ airplane flight travel
🛫 departure
🛬 arrival
🚁 helicopter
🚀 rocket launch ship
🛸 ufo
🛰️ satellite
🗺️ map
🧭 compass
🏔️ mountain snow
⛰️ mountain
🏕️ camping
🏖️ beach
🏝️ island
🏜️ desert
🏠 house home
🏡 home garden
🏢 office building
🏭 factory
🏰 castle
🗼 tower
🗽 statue of liberty
⛲ fountain
🌁 foggy
🌃 night city
🌅 sunrise
🌇 sunset
🎡 ferris wheel
🎢 roller coaster
`,
  Objects: `
⌚ watch
📱 phone mobile
💻 laptop computer
⌨️ keyboard
🖥️ desktop computer
🖨️ printer
🖱️ mouse
💾 floppy save
💿 cd
📷 camera
📸 camera flash photo
🎥 movie camera
📺 tv television
📻 radio
🎙️ studio microphone podcast
⏰ alarm clock
⏳ hourglass waiting
⌛ hourglass done
📡 satellite antenna
🔋 battery
🔌 plug
💡 bulb idea light
🔦 flashlight
🕯️ candle
🧯 extinguisher
💸 money wings
💵 dollar cash
💰 money bag
💳 credit card
💎 gem diamond
⚖️ scales balance
🧰 toolbox
🔧 wrench fix
🔨 hammer build
🛠️ tools
⚙️ gear settings
🧱 brick
🔩 nut bolt
🧲 magnet
🔫 water pistol
💣 bomb
🔪 knife
🛡️ shield
🔮 crystal ball
🧿 nazar
💊 pill
💉 syringe vaccine
🧬 dna
🦠 microbe germ
🧪 test tube experiment
🔬 microscope
🔭 telescope
🧹 broom clean
🧺 basket
🧻 toilet paper
🚽 toilet
🛁 bathtub
🔑 key
🗝️ old key
🚪 door
🪑 chair
🛋️ couch
🛏️ bed
🧸 teddy bear
🖼️ picture frame
🛍️ shopping bags
🛒 cart shopping
✉️ envelope email
📧 email e-mail
📨 incoming envelope
📩 envelope arrow
📦 package box ship
🏷️ label tag
📪 mailbox
📝 memo note write
📄 page document
📃 page curl
📑 bookmark tabs
📊 bar chart stats
📈 chart up growth
📉 chart down decline
🗒️ notepad
📅 calendar date
📆 tear-off calendar
📇 card index
🗃️ card file box
🗄️ file cabinet
📋 clipboard
📁 folder
📂 open folder
📌 pushpin pin
📍 round pin location
📎 paperclip attach
🖇️ paperclips
📏 ruler
📐 triangle ruler
✂️ scissors cut
🗑️ wastebasket trash delete
🔒 lock locked secure
🔓 unlock
🔐 lock key
📓 notebook
📕 book closed
📖 open book read
📚 books library
🔖 bookmark
🔗 link chain
✏️ pencil edit
🖊️ pen
🖌️ paintbrush
🖍️ crayon
🔍 search magnifying
🔎 search right
`,
  Symbols: `
❤️ red heart love
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
🤎 brown heart
💔 broken heart
❣️ heart exclamation
💕 two hearts
💞 revolving hearts
💓 beating heart
💗 growing heart
💖 sparkling heart
💘 heart arrow
💝 heart ribbon
💯 hundred 100 perfect
💢 anger
💥 boom collision
💫 dizzy star
💦 sweat drops
💨 dash fast
💬 speech bubble comment
💭 thought bubble
🗯️ anger bubble
💤 zzz sleep
✅ check done yes complete
☑️ checkbox
✔️ check mark
❌ cross no wrong
❎ cross button
➕ plus add
➖ minus
➗ divide
✖️ multiply
❓ question
❔ white question
❗ exclamation important
❕ white exclamation
‼️ double exclamation
⁉️ interrobang
⚠️ warning caution
🚫 prohibited no
⛔ no entry stop
🛑 stop sign
🔴 red circle
🟠 orange circle
🟡 yellow circle
🟢 green circle
🔵 blue circle
🟣 purple circle
⚫ black circle
⚪ white circle
🟥 red square
🟩 green square
🟦 blue square
🔺 red triangle up
🔻 red triangle down
🔸 orange diamond
🔹 blue diamond
♻️ recycle
⚜️ fleur de lis
🔰 beginner
✳️ eight spoked asterisk
❇️ sparkle
©️ copyright
®️ registered
™️ trademark
🆕 new
🆗 ok button
🆙 up button
🆒 cool button
🆓 free
🔝 top
🔜 soon
🔙 back
🔛 on
🔚 end
⬆️ up arrow
⬇️ down arrow
⬅️ left arrow
➡️ right arrow
↩️ return back
↪️ forward
🔄 refresh sync
🔁 repeat
🔀 shuffle
▶️ play
⏸️ pause
⏹️ stop
⏺️ record
⏭️ next
⏮️ previous
🔊 loud speaker
🔇 mute
🔔 bell notification
🔕 bell off
📣 megaphone announce
📢 loudspeaker
🏁 checkered flag finish
🚩 red flag
🏳️ white flag
🏴 black flag
🏳️‍🌈 rainbow flag pride
`,
};

export type EmojiEntry = { emoji: string; words: string };
export type EmojiCategory = { name: string; emojis: EmojiEntry[] };

export const EMOJI_CATEGORIES: EmojiCategory[] = Object.entries(RAW).map(([name, block]) => ({
  name,
  emojis: block
    .trim()
    .split('\n')
    .map((line) => {
      const [emoji, ...words] = line.trim().split(' ');
      return { emoji, words: words.join(' ') };
    }),
}));

export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((category) => category.emojis);

export function searchEmojis(query: string): EmojiEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return ALL_EMOJIS;
  return ALL_EMOJIS.filter((entry) => terms.every((term) => entry.words.split(' ').some((word) => word.startsWith(term))));
}
