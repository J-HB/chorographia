import { App, Modal, Notice, Setting } from "obsidian";
import type ChorographiaPlugin from "./main";
import { BUILTIN_THEMES } from "./theme";

const TOTAL_STEPS = 4;

// ASCII previews for zone style cards
const STARMAP_PREVIEW = [
	"        . *   .  *    .   ",
	"   *  .    (~~~)    *     ",
	" .   (~~~~~~~)  .    *  . ",
	"    (~~~) .  (~~~~)       ",
	"  *   .  *  (~~~~~~~~)  . ",
	"   .    *     (~~~) .   * ",
	"      .   .  *    .   .   ",
].join("\n");

const WORLDMAP_PREVIEW = [
	"  ~~~  ._,-''-.   ~~~  ~~ ",
	"  ~ ,-'  /     '-.  ~~~~  ",
	"  ,'   ./ ,---.   '.  ~~  ",
	" /   __/ /     \\    \\ ~~~ ",
	" |  /  |  ___  |    | ~~  ",
	"  \\ \\   \\/   \\/   ,'  ~~ ",
	"   '-._       _.-' ~~~~   ",
	"  ~~~~  ''---''  ~~~~~~~~ ",
].join("\n");

export class OnboardingModal extends Modal {
	private plugin: ChorographiaPlugin;
	private currentStep = 0;

	constructor(app: App, plugin: ChorographiaPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		this.modalEl.addClass("chorographia-onboarding");
		this.renderStep();
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderStep() {
		this.contentEl.empty();
		switch (this.currentStep) {
			case 0: this.renderProviderStep(); break;
			case 1: this.renderNoteSelectionStep(); break;
			case 2: this.renderMapStyleStep(); break;
			case 3: this.renderConfirmStep(); break;
		}
		this.renderFooter();
	}

	// ===================== Step 0: Provider =====================

	private renderProviderStep() {
		this.contentEl.createEl("h2", { text: "Welcome" });
		this.contentEl.createEl("p", {
			text: "This plugin builds a semantic map of your vault by embedding your notes into vectors and projecting them onto a canvas. Let\u2019s configure your embedding provider.",
			cls: "chorographia-onboarding-desc",
		});

		const s = this.plugin.settings;

		new Setting(this.contentEl)
			.setName("Embedding provider")
			.addDropdown((dd) =>
				dd
					.addOption("ollama", "Ollama (local)")
					.addOption("openai", "OpenAI")
					.addOption("openrouter", "OpenRouter")
					.setValue(s.embeddingProvider)
					.onChange((value) => {
						s.embeddingProvider = value as typeof s.embeddingProvider;
						void this.plugin.saveSettings();
						this.renderStep();
					})
			);

		if (s.embeddingProvider === "ollama") {
			new Setting(this.contentEl)
				.setName("Server URL")
				.addText((text) =>
					text
						.setPlaceholder("HTTP://localhost:11434")
						.setValue(s.ollamaUrl)
						.onChange((value) => {
							s.ollamaUrl = value;
							void this.plugin.saveSettings();
						})
						.then((t) => { t.inputEl.addClass("chorographia-input-lg"); })
				);

			new Setting(this.contentEl)
				.setName("Embedding model")
				.addText((text) =>
					text
						.setPlaceholder("Qwen3-embedding")
						.setValue(s.ollamaEmbedModel)
						.onChange((value) => {
							s.ollamaEmbedModel = value;
							void this.plugin.saveSettings();
						})
				);

			this.contentEl.createEl("p", {
				text: "No API key needed \u2014 this provider runs locally on your machine.",
				cls: "chorographia-onboarding-hint",
			});
		} else if (s.embeddingProvider === "openai") {
			new Setting(this.contentEl)
				.setName("API key")
				.addText((text) =>
					text
						.setPlaceholder("Sk-...")
						.setValue(s.openaiApiKey)
						.onChange((value) => {
							s.openaiApiKey = value;
							void this.plugin.saveSettings();
						})
						.then((t) => {
							t.inputEl.type = "password";
							t.inputEl.addClass("chorographia-input-xl");
						})
				);

			new Setting(this.contentEl)
				.setName("Embedding model")
				.addText((text) =>
					text
						.setPlaceholder("Text-embedding-3-large")
						.setValue(s.embeddingModel)
						.onChange((value) => {
							s.embeddingModel = value;
							void this.plugin.saveSettings();
						})
				);
		} else if (s.embeddingProvider === "openrouter") {
			new Setting(this.contentEl)
				.setName("API key")
				.addText((text) =>
					text
						.setPlaceholder("Sk-or-...")
						.setValue(s.openrouterApiKey)
						.onChange((value) => {
							s.openrouterApiKey = value;
							void this.plugin.saveSettings();
						})
						.then((t) => {
							t.inputEl.type = "password";
							t.inputEl.addClass("chorographia-input-xl");
						})
				);

			new Setting(this.contentEl)
				.setName("Embedding model")
				.addText((text) =>
					text
						.setPlaceholder("OpenAI/text-embedding-3-small")
						.setValue(s.openrouterEmbedModel)
						.onChange((value) => {
							s.openrouterEmbedModel = value;
							void this.plugin.saveSettings();
						})
				);
		}
	}

	// ===================== Step 1: Note Selection =====================

	private renderNoteSelectionStep() {
		this.contentEl.createEl("h2", { text: "Choose which notes to map" });

		const s = this.plugin.settings;

		new Setting(this.contentEl)
			.setName("Include globs")
			.setDesc("Comma-separated glob patterns for notes to index.")
			.addText((text) =>
				text
					.setPlaceholder("**/*.md")
					.setValue(s.includeGlobs)
					.onChange((value) => {
						s.includeGlobs = value;
						void this.plugin.saveSettings();
					})
					.then((t) => { t.inputEl.addClass("chorographia-input-xl"); })
			);

		new Setting(this.contentEl)
			.setName("Exclude globs")
			.setDesc("Comma-separated glob patterns for notes to skip.")
			.addText((text) =>
				text
					.setPlaceholder("Templates/**,daily/**")
					.setValue(s.excludeGlobs)
					.onChange((value) => {
						s.excludeGlobs = value;
						void this.plugin.saveSettings();
					})
					.then((t) => { t.inputEl.addClass("chorographia-input-xl"); })
			);

		new Setting(this.contentEl)
			.setName("Max notes")
			.setDesc("Safety cap on number of notes to index.")
			.addText((text) =>
				text
					.setValue(String(s.maxNotes))
					.onChange((value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							s.maxNotes = n;
							void this.plugin.saveSettings();
						}
					})
					.then((t) => { t.inputEl.addClass("chorographia-input-xs"); })
			);
	}

	// ===================== Step 2: Map Style =====================

	private renderMapStyleStep() {
		this.contentEl.createEl("h2", { text: "Choose your map style" });
		this.contentEl.createEl("p", {
			text: "Semantic zones group nearby notes into labeled regions. Pick a visual style and theme for your map.",
			cls: "chorographia-onboarding-desc",
		});

		const s = this.plugin.settings;

		// Zones toggle
		new Setting(this.contentEl)
			.setName("Show semantic zones")
			.setDesc("Display thematic cluster regions behind notes on the map.")
			.addToggle((toggle) =>
				toggle
					.setValue(s.showZones)
					.onChange((value) => {
						s.showZones = value;
						void this.plugin.saveSettings();
						this.renderStep();
					})
			);

		if (s.showZones) {
			// Zone style picker with visual previews
			const picker = this.contentEl.createEl("div", { cls: "chorographia-onboarding-style-picker" });

			const styles: { id: "starmap" | "worldmap"; label: string; desc: string; preview: string }[] = [
				{
					id: "starmap",
					label: "Star map",
					desc: "Overlapping smooth nebula blobs",
					preview: STARMAP_PREVIEW,
				},
				{
					id: "worldmap",
					label: "World map",
					desc: "Non-overlapping countries with coastlines",
					preview: WORLDMAP_PREVIEW,
				},
			];

			for (const style of styles) {
				const card = picker.createEl("div", {
					cls: `chorographia-onboarding-style-card${s.zoneStyle === style.id ? " is-selected" : ""}`,
				});
				card.addEventListener("click", () => {
					s.zoneStyle = style.id;
					void this.plugin.saveSettings();
					this.renderStep();
				});

				card.createEl("pre", {
					cls: "chorographia-onboarding-style-preview",
					text: style.preview,
				});

				card.createEl("div", { text: style.label, cls: "chorographia-onboarding-style-label" });
				card.createEl("div", { text: style.desc, cls: "chorographia-onboarding-style-desc" });
			}
		}

		// Theme picker
		new Setting(this.contentEl)
			.setName("Theme")
			.setDesc("Visual palette, fonts, and decorative elements.")
			.addDropdown((dd) => {
				for (const t of BUILTIN_THEMES) dd.addOption(t.id, t.name);
				dd.setValue(s.activeTheme);
				dd.onChange((value) => {
					s.activeTheme = value;
					void this.plugin.saveSettings();
				});
			});

		// Color mode
		new Setting(this.contentEl)
			.setName("Color mode")
			.setDesc("How to color note points on the map.")
			.addDropdown((dd) =>
				dd
					.addOption("semantic", "Semantic \u2014 by topic cluster")
					.addOption("folder", "Folder \u2014 by vault folder")
					.addOption("property", "Property \u2014 by frontmatter field")
					.setValue(s.colorMode)
					.onChange((value) => {
						s.colorMode = value as typeof s.colorMode;
						void this.plugin.saveSettings();
					})
			);
	}

	// ===================== Step 3: Confirm =====================

	private renderConfirmStep() {
		this.contentEl.createEl("h2", { text: "Ready to build your map" });

		const s = this.plugin.settings;

		const card = this.contentEl.createEl("div", { cls: "chorographia-onboarding-summary" });
		const providerLabel =
			s.embeddingProvider === "ollama" ? "Ollama (local)" :
			s.embeddingProvider === "openai" ? "OpenAI" : "OpenRouter";
		const modelLabel =
			s.embeddingProvider === "ollama" ? s.ollamaEmbedModel :
			s.embeddingProvider === "openai" ? s.embeddingModel : s.openrouterEmbedModel;
		const styleLabel =
			s.showZones
				? (s.zoneStyle === "worldmap" ? "World map" : "Star map")
				: "Off";
		const themeObj = BUILTIN_THEMES.find((t) => t.id === s.activeTheme);
		const colorModeLabel =
			s.colorMode === "semantic" ? "Semantic" :
			s.colorMode === "folder" ? "Folder" : "Property";

		const rows: [string, string][] = [
			["Provider", providerLabel],
			["Model", modelLabel || "(default)"],
			["Include", s.includeGlobs || "**/*.md"],
			["Exclude", s.excludeGlobs || "(none)"],
			["Max notes", String(s.maxNotes)],
			["Zones", styleLabel],
			["Theme", themeObj?.name ?? s.activeTheme],
			["Colors", colorModeLabel],
		];
		for (const [label, value] of rows) {
			const row = card.createEl("div", { cls: "chorographia-onboarding-summary-row" });
			row.createEl("span", { text: label, cls: "chorographia-onboarding-summary-label" });
			row.createEl("span", { text: value, cls: "chorographia-onboarding-summary-value" });
		}
	}

	// ===================== Footer =====================

	private renderFooter() {
		const footer = this.contentEl.createEl("div", { cls: "chorographia-onboarding-footer" });

		// Step dots
		const dots = footer.createEl("div", { cls: "chorographia-onboarding-dots" });
		for (let i = 0; i < TOTAL_STEPS; i++) {
			const cls = i < this.currentStep ? "done" : i === this.currentStep ? "active" : "pending";
			dots.createEl("span", { cls: `chorographia-onboarding-dot ${cls}` });
		}

		// Nav buttons
		const nav = footer.createEl("div", { cls: "chorographia-onboarding-nav" });

		if (this.currentStep > 0) {
			nav.createEl("button", { text: "Back", cls: "chorographia-onboarding-btn" })
				.addEventListener("click", () => { this.currentStep--; this.renderStep(); });
		}

		nav.createEl("button", { text: "Skip setup", cls: "chorographia-onboarding-btn chorographia-onboarding-btn-skip" })
			.addEventListener("click", () => { this.close(); });

		if (this.currentStep < TOTAL_STEPS - 1) {
			const nextBtn = nav.createEl("button", { text: "Next", cls: "chorographia-onboarding-btn chorographia-onboarding-btn-primary" });
			nextBtn.addEventListener("click", () => {
				if (!this.validateStep()) return;
				this.currentStep++;
				this.renderStep();
			});
		} else {
			const startBtn = nav.createEl("button", { text: "Start embedding", cls: "chorographia-onboarding-btn chorographia-onboarding-btn-primary" });
			startBtn.addEventListener("click", () => {
				this.close();
				void this.plugin.runEmbedPipeline();
			});
		}
	}

	private validateStep(): boolean {
		const s = this.plugin.settings;
		if (this.currentStep === 0) {
			if (s.embeddingProvider === "openai" && !s.openaiApiKey.trim()) {
				new Notice("Please enter your API key.");
				return false;
			}
			if (s.embeddingProvider === "openrouter" && !s.openrouterApiKey.trim()) {
				new Notice("Please enter your API key.");
				return false;
			}
		}
		return true;
	}
}
