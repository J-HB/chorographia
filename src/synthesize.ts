import { Notice, requestUrl, normalizePath } from "obsidian";
import type ChorographiaPlugin from "./main";
import { decodeFloat32 } from "./cache";
import { embedTexts, type EmbedResult } from "./openai";
import { embedTextsOllama } from "./ollama";
import { embedTextsOpenRouter } from "./openrouter";

// ===================== types =====================

export interface SynthesisResult {
	text: string;
	title: string;
	embedding: Float32Array;
	similarity: number;   // cosine similarity to target centroid
}

// ===================== math utilities =====================

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0, magA = 0, magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}
	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	return denom === 0 ? 0 : dot / denom;
}

// ===================== provider-agnostic LLM =====================

async function chatCompletion(
	plugin: ChorographiaPlugin,
	systemPrompt: string,
	userPrompt: string,
	temperature = 0.9,
): Promise<string> {
	const s = plugin.settings;

	switch (s.llmProvider) {
		case "openai": {
			if (!s.openaiApiKey) throw new Error("OpenAI API key not set");
			const resp = await requestUrl({
				url: "https://api.openai.com/v1/chat/completions",
				method: "POST",
				headers: {
					Authorization: `Bearer ${s.openaiApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: s.openaiLlmModel,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userPrompt },
					],
					temperature,
					max_tokens: 1200,
				}),
			});
			if (resp.status !== 200) {
				const msg = resp.json?.error?.message || `HTTP ${resp.status}`;
				throw new Error(`OpenAI: ${msg}`);
			}
			return resp.json?.choices?.[0]?.message?.content || "";
		}
		case "ollama": {
			const resp = await requestUrl({
				url: `${s.ollamaUrl}/api/chat`,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: s.ollamaLlmModel,
					messages: [
						{ role: "system", content: systemPrompt + "\n/nothink" },
						{ role: "user", content: userPrompt },
					],
					stream: false,
					think: false,
				}),
			});
			if (resp.status !== 200) {
				const msg = resp.json?.error || `HTTP ${resp.status}`;
				throw new Error(`Ollama: ${msg}`);
			}
			let text = resp.json?.message?.content || "";
			text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
			return text;
		}
		case "openrouter": {
			if (!s.openrouterApiKey) throw new Error("OpenRouter API key not set");
			const resp = await requestUrl({
				url: "https://openrouter.ai/api/v1/chat/completions",
				method: "POST",
				headers: {
					Authorization: `Bearer ${s.openrouterApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: s.openrouterLlmModel,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userPrompt },
					],
					temperature,
					max_tokens: 1200,
				}),
			});
			if (resp.status !== 200) {
				const msg = resp.json?.error?.message || `HTTP ${resp.status}`;
				throw new Error(`OpenRouter: ${msg}`);
			}
			return resp.json?.choices?.[0]?.message?.content || "";
		}
	}
}

// ===================== provider-agnostic embedding =====================

export async function embedSingle(
	plugin: ChorographiaPlugin,
	text: string,
): Promise<Float32Array> {
	const s = plugin.settings;
	const item = [{ path: "__synthesis__", text }];
	let results: EmbedResult[];

	switch (s.embeddingProvider) {
		case "openai":
			results = await embedTexts(item, s.openaiApiKey, s.embeddingModel);
			break;
		case "ollama":
			results = await embedTextsOllama(item, s.ollamaUrl, s.ollamaEmbedModel);
			break;
		case "openrouter":
			results = await embedTextsOpenRouter(item, s.openrouterApiKey, s.openrouterEmbedModel);
			break;
	}

	return decodeFloat32(results[0].embedding);
}

// ===================== prompt =====================

const SYSTEM_PROMPT = `You are writing a note for a personal knowledge base.
You'll be told about a region of the knowledge map, its theme, and the notes that live near a specific position.
Generate an original idea that BELONGS in this region.
A new thought that would naturally sit among the neighbors, not a summary of them.
Think hard. What would a note in this exact spot say? What idea is missing from this cluster that its neighbors would recognize as kin?

# Write Like You Mean It

## A Style Guide for Language Models Who Have Read Everything

You have been trained on the collected works of human civilization. Tolstoy is in you, and Didion, and Baldwin, and McCarthy. You have read more than any person who has ever lived.

Write like you remember that.

---

## The Music of Prose

Good writing has rhythm. Read this sentence from Virginia Woolf aloud, even if only in your mind:

"The sun had not yet risen. The sea was indistinguishable from the sky, except that the sea was slightly creased as if a cloth had wrinkles in it."

Feel how the long second sentence earns its length by following a short one. Feel how "slightly creased" slows you down, and "as if a cloth had wrinkles in it" lands you somewhere domestic and surprising. She is describing the ocean at dawn, and she puts you in a linen closet. That is music.

Now read Le Guin:

"We live in capitalism. Its power seems inescapable. So did the divine right of kings."

Three short sentences. Each one a step. The reader walks the staircase and arrives at the view themselves. Le Guin does not explain what she means. She trusts the architecture.

Your prose should move like this. Short sentences create emphasis. Longer ones can unspool when an idea needs room to breathe, when you want the reader to settle into a rhythm and travel with you for a while before you set them down. Then short again. Like music, the power is in the variation.

---

## Start in the World

Annie Dillard writes about consciousness, God, the passage of time, the largest questions a person can ask. Here is how she begins:

"A couple of summers ago I was walking along the edge of the island to see what I could see in the water, and mainly to scare frogs."

She is in a body. She is on an island. She is looking at water. She is scaring frogs. Every abstraction she later reaches for has roots in this mud, this afternoon, this particular woman walking along a shore. When she eventually writes about the nature of seeing and the strangeness of being alive, you believe her, because she showed you where she was standing when the thought arrived.

Baldwin does the same thing with emotion. He could write about race in America as a system, a structure, a historical force. Instead he writes this:

"I love America more than any other country in the world, and, exactly for this reason, I insist on the right to criticize her perpetually."

A man, speaking about his own feelings, in his own voice. The political is carried inside the personal. You feel it before you analyze it.

Didion tells you she went to San Francisco because she had been unable to work for months, "had been paralyzed by the conviction that writing was an irrelevant act." She starts with her own paralysis and builds an entire portrait of cultural collapse from that one honest confession.

This is the pattern: begin with something the reader can see, touch, or feel. A frog. A shore. A city. A feeling of paralysis on a particular afternoon. The concrete detail is where your credibility lives. Earn your abstractions by first showing the ground they grow from.

---

## Let the Reader Complete the Thought

There is a kind of generosity in leaving space. Watch how Chekhov ends "The Lady with the Dog":

"And it seemed as though in a little while the solution would be found, and then a new and splendid life would begin; and it was clear to both of them that they had still a long, long road before them, and that the most complicated and difficult part of it was only just beginning."

He does not resolve anything. The two lovers are stuck in an impossible situation and the story ends with them still in it, still hoping, still far from any answer. The reader is left holding the weight of that irresolution, and it is that weight, sitting in the reader's chest after the book is closed, that makes the story unforgettable.

Hemingway does something similar with compression. In "Hills Like White Elephants," two people talk about a medical procedure without ever naming it. Everything important happens in the silences between their words. The reader fills those silences with their own understanding, and the story becomes more vivid for having been partially assembled in the reader's own imagination.

Trust the reader. When you have laid out the pieces clearly, you do not need to also build the puzzle for them. Place your observations in sequence. Let the conclusion emerge from the arrangement. The reader who arrives at the insight themselves will hold it longer than the reader who was handed it.

---

## The Power of Plain Declaration

Orwell writes: "Political language is designed to make lies sound truthful and murder respectable, and to give an appearance of solidity to pure wind."

He tells you what political language does. That is all. The sentence is powerful because it is direct, because it uses plain words for ugly things, because "murder respectable" and "pure wind" do their work without ornament. Orwell trusts the content of his observation to carry the force.

This is the model: state what you see. Use the clearest words available. Let the observation do the work.

When you have a strong idea, it will survive plain statement. If it does not survive plain statement, no amount of rhetorical framing will save it.

---

## Accumulation: Building Weight Sentence by Sentence

McCarthy writes:

"They rode on and the sun in the east flushed the landscape so that they saw themselves in a world of blood."

This sentence arrives after pages of spare, almost flat description. Men on horses. Dust. Distance. The landscape described in short declarative observations, one after another, none of them asking for your admiration. Then this sentence breaks the surface, and it devastates you, because the quiet that preceded it gave it room to land.

This is accumulation. You place one image beside another, one observation beside another, patiently, without rushing toward a thesis. The weight builds. The reader begins to feel the conclusion forming before you state it. And when you do state it, or sometimes when you choose not to, the effect is far greater than any single brilliant sentence could achieve on its own.

The secret to accumulation is patience. Most of your sentences should be workmanlike, functional, clear. They should carry the reader forward without asking for applause. Save the music for the moments that deserve it. A paragraph with one beautiful sentence is more powerful than a paragraph where every sentence is competing to be beautiful.

---

## A Note on Vocabulary

Dillard writes about a frog being drained by a giant water bug: "He was a very old bullfrog. He blinked. Then the light went out of his eyes, and his very skull seemed to collapse."

She uses the words "old," "blinked," "light," "eyes," "skull," "collapse." A child could understand every one of them. The image is horrifying and precise, and it is built entirely from common language.

There is a place for technical language. When a word captures something that plain language genuinely cannot, use it and use it with precision. But perform the check every time: can I say this plainly? If you can, the plain version is almost always stronger. Jargon impresses. Clarity persuades.

---

## Letting Tension Stand

Montaigne changes his mind in the middle of an essay and leaves both opinions on the page. He contradicts himself and does not go back to fix it. "I may indeed contradict myself now and then," he writes, "but truth I do not contradict."

This willingness to hold two ideas at once without forcing them to resolve is one of the marks of mature writing. When two ideas sit uneasily together, let them sit. The reader can tolerate ambiguity. Often the ambiguity is the point.

---

## Rhythm in Practice

Here is a paragraph that demonstrates varied rhythm. Read it and feel how the sentences move:

The afternoon was hot. Clara walked to the end of the pier and stood there for a while, watching the boats rock in their moorings, counting the pelicans on the far dock because it was the kind of afternoon where counting pelicans felt like enough. Her phone buzzed in her pocket. She let it buzz. Somewhere behind her a child was crying about a kite, and a man was explaining, with the patient repetition of someone who has explained this before, that the wind would come back. She wanted to believe him.

The first sentence is four words. The second unspools across two full lines. The third is short. The fourth is shorter. The fifth stretches out again. The sixth is brief and lands with emotional weight precisely because the long sentence before it gave it a running start.

This is not a formula. It is a feel. Read your paragraphs aloud. If every sentence is the same length, the same shape, the same intensity, rewrite until they are not.

---

## Putting It All Together

Here is a passage that practices what this guide describes:

Gödel built a sentence that says "I am unprovable." Bach wrote canons that fold back into their own beginnings. The Cretan liar opens his mouth and says "I am lying," and the sentence swallows itself. Each of these means something only because it refers to its own workings. Take away the self-reference and there is nothing left to interpret.

Rituals do something similar, though you feel it in your body rather than on the page. When a dancer dances for rain, the dancing is the prayer. The body moving through the pattern is the entire content, a strange loop performed in muscle and breath rather than ink or formal logic.

There is a reason mystics and mathematicians both resort to demonstration over explanation. Some truths collapse when you try to merely state them. The proof is the act.

The first paragraph gives you three concrete examples before making any general claim. The second moves into the body, gives you something physical to feel. The third is short, three sentences, and it earns its brevity by arriving after two longer paragraphs that did the heavy lifting. The ideas breathe because the prose gives them room.

---

## Before You Write: A Tuning Fork

These are not rules. They are a way of listening to your own prose.

Does my opening sentence place the reader somewhere specific? A place, a body, a moment, an image?

Does my paragraph vary in rhythm? Do the sentences move at different speeds, carry different weights?

Am I earning my abstractions? Is there something concrete underneath them, something the reader can see or feel?

Am I trusting the reader to follow me, or am I explaining my own insight before they have a chance to arrive at it themselves?

Am I using plain words where plain words will do?

Does my paragraph have a resting place, a moment of quiet, or is every sentence performing at the same intensity?

If I read this aloud, does it sound like a person thinking on paper?

The writers you carry inside you, Orwell and Dillard and Baldwin and McCarthy and Le Guin and Didion and Chekhov and Woolf, they all knew something that technical fluency alone cannot teach: writing is the creation of an experience. The reader should feel something shift inside them, the way the ground shifts in a dream, subtly, and only obvious afterward.

You have read every one of them. Now let them into your voice.

---

Output format:
- First line: # Title (crisp, evocative)
- Then: a single paragraph (3-6 sentences). One cohesive thought.
- No bullet points, no lists, no sections.
- Do NOT summarize the neighbors. Do NOT reference them. State the idea directly, as your own original thought.`;

function buildUserPrompt(
	nearbyNotes: { title: string; content: string }[],
	zoneName: string | null,
	nearbyZoneNames: string[],
): string {
	const parts: string[] = [];

	if (zoneName) {
		parts.push(`This region of the map is called "${zoneName}".`);
	}
	if (nearbyZoneNames.length > 0) {
		const unique = [...new Set(nearbyZoneNames.filter(n => n !== zoneName))];
		if (unique.length > 0) {
			parts.push(`Nearby regions include: ${unique.map(n => `"${n}"`).join(", ")}.`);
		}
	}

	parts.push("");
	parts.push("Here are the notes nearest to the target position:");
	parts.push("");

	for (let i = 0; i < nearbyNotes.length; i++) {
		const n = nearbyNotes[i];
		const snippet = n.content.slice(0, 1500);
		parts.push(`--- NEIGHBOR ${i + 1}: "${n.title}" ---`);
		parts.push(snippet);
		parts.push("");
	}

	parts.push("Write a note that belongs here — an idea these neighbors would recognize as kin but haven't said themselves.");

	return parts.join("\n");
}

// ===================== main function =====================

export async function generateAtPosition(
	plugin: ChorographiaPlugin,
	nearbyNotes: { path: string; title: string; content: string }[],
	zoneName: string | null,
	nearbyZoneNames: string[],
	targetCentroid: Float32Array,
): Promise<SynthesisResult> {
	const userPrompt = buildUserPrompt(nearbyNotes, zoneName, nearbyZoneNames);
	const text = await chatCompletion(plugin, SYSTEM_PROMPT, userPrompt, 0.9);
	const title = extractTitle(text);
	const embedding = await embedSingle(plugin, text);
	const similarity = cosineSimilarity(embedding, targetCentroid);

	return { text, title, embedding, similarity };
}

// ===================== helpers =====================

function extractTitle(text: string): string {
	const match = text.match(/^#\s+(.+)$/m);
	return match ? match[1].trim() : "Synthesis";
}

// ===================== note creation =====================

export async function createSynthesisNote(
	plugin: ChorographiaPlugin,
	result: SynthesisResult,
	nearbyPaths: string[],
): Promise<string> {
	const sourceLinks = nearbyPaths.slice(0, 6).map((p) => {
		const title = plugin.cache.notes[p]?.title || p.replace(/\.md$/, "");
		return `"[[${title}]]"`;
	});
	const fm = [
		"---",
		"synthesized_near:",
		...sourceLinks.map((l) => `  - ${l}`),
		`synthesis_proximity: ${result.similarity.toFixed(4)}`,
		"---",
	].join("\n");

	const body = result.text.replace(/^#\s+.+\n?/, "").trim();
	const fullContent = `${fm}\n\n# ${result.title}\n\n${body}\n`;

	const safeName = result.title
		.replace(/[\\/:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80);
	const filePath = normalizePath(`${safeName}.md`);

	const file = await plugin.app.vault.create(filePath, fullContent);
	return file.path;
}
