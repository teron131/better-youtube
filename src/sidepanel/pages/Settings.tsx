import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Switch } from "@ui/components/ui/switch";
import { useToast } from "@ui/hooks/use-toast";
import { ArrowLeft, Save, Key, Cpu, Globe, Type, Settings as SettingsIcon, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStorageValues, setStorageValue } from "@/lib/storage";
import { RECOMMENDED_SUMMARIZER_MODELS, RECOMMENDED_REFINER_MODELS, TARGET_LANGUAGES } from "@/lib/constants";
import { EditableCombobox } from "@ui/components/ui/editable-combobox";

const SETTINGS_KEYS = [
  "scrapeCreatorsApiKey",
  "openRouterApiKey",
  "summarizerModel",
  "refinerModel",
  "targetLanguage",
  "captionFontSize",
  "summaryFontSize",
  "autoGenerate",
  "showSubtitles",
];

const DEFAULT_SETTINGS = {
  scrapeCreatorsApiKey: "",
  openRouterApiKey: "",
  summarizerModel: "x-ai/grok-4.1-fast",
  refinerModel: "google/gemini-2.5-flash-lite-preview-09-2025",
  targetLanguage: "auto",
  captionFontSize: "M",
  summaryFontSize: "M",
  autoGenerate: false,
  showSubtitles: true,
};

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await getStorageValues(SETTINGS_KEYS);
        setSettings((prev) => ({ ...prev, ...stored }));
      } catch (error) {
        console.error("Failed to load settings:", error);
        toast({
          title: "Error",
          description: "Failed to load settings.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [toast]);

  const handleChange = async (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await setStorageValue(key, value);
      console.log(`Auto-saved ${key}:`, value);
    } catch (error) {
      console.error(`Failed to auto-save setting ${key}:`, error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
            <SettingsIcon className="h-6 w-6 text-primary animate-spin-slow" />
          </div>
          <p className="text-zinc-500 font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-foreground pb-20">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <div className="container mx-auto px-6 max-w-4xl pt-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 fade-in-up">
          <div className="flex items-center gap-6">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => navigate("/")} 
              className="rounded-xl border-border/50 bg-background/60 hover:bg-primary/10 hover:border-primary/30 transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white">
                Settings
              </h1>
              <p className="text-zinc-400 mt-1">Configure your AI models and display preferences</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 fade-in-up stagger-1">
          {/* API Configuration */}
          <Card className="rounded-[24px] border-border/50 bg-background/60 backdrop-blur-xl shadow-2xl hover:border-primary/20 transition-all duration-500">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Key className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">API Configuration</span>
              </div>
              <CardTitle className="text-2xl font-bold text-white">Authentication</CardTitle>
              <CardDescription className="text-zinc-400">Manage your access keys for transcription and AI services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="scrapeCreatorsApiKey" className="text-sm font-semibold text-zinc-200">Scrape Creators API Key</Label>
                  <a href="https://scrapecreators.com" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Get Key</a>
                </div>
                <Input
                  id="scrapeCreatorsApiKey"
                  type="password"
                  value={settings.scrapeCreatorsApiKey}
                  onChange={(e) => handleChange("scrapeCreatorsApiKey", e.target.value)}
                  className="h-12 bg-black/40 border-zinc-800/50 rounded-xl focus:ring-primary/20 focus:border-primary/30 text-white placeholder:text-zinc-600"
                  placeholder="sc_..."
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="openRouterApiKey" className="text-sm font-semibold text-zinc-200">OpenRouter API Key</Label>
                  <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Get Key</a>
                </div>
                <Input
                  id="openRouterApiKey"
                  type="password"
                  value={settings.openRouterApiKey}
                  onChange={(e) => handleChange("openRouterApiKey", e.target.value)}
                  className="h-12 bg-black/40 border-zinc-800/50 rounded-xl focus:ring-primary/20 focus:border-primary/30 text-white placeholder:text-zinc-600"
                  placeholder="sk-or-..."
                />
              </div>
            </CardContent>
          </Card>

          {/* AI Intelligence */}
          <Card className="rounded-[24px] border-border/50 bg-background/60 backdrop-blur-xl shadow-2xl hover:border-primary/20 transition-all duration-500">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">AI Intelligence</span>
              </div>
              <CardTitle className="text-2xl font-bold text-white">Model Selection</CardTitle>
              <CardDescription className="text-zinc-400">Choose which AI engines power your summaries and captions</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="summarizerModel" className="text-sm font-semibold text-zinc-200">Analysis & Summary Engine</Label>
                <EditableCombobox
                  value={settings.summarizerModel}
                  onChange={(val) => handleChange("summarizerModel", val)}
                  options={RECOMMENDED_SUMMARIZER_MODELS.map(m => ({ value: m.value, label: m.label }))}
                  placeholder="Select or type model..."
                  inputClassName="h-12 bg-black/40 border-zinc-800/50 rounded-xl focus:ring-primary/20 text-white"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="refinerModel" className="text-sm font-semibold text-zinc-200">Caption Refinement Engine</Label>
                <EditableCombobox
                  value={settings.refinerModel}
                  onChange={(val) => handleChange("refinerModel", val)}
                  options={RECOMMENDED_REFINER_MODELS.map(m => ({ value: m.value, label: m.label }))}
                  placeholder="Select or type model..."
                  inputClassName="h-12 bg-black/40 border-zinc-800/50 rounded-xl focus:ring-primary/20 text-white"
                />
              </div>
            </CardContent>
          </Card>

          {/* User Experience */}
          <Card className="rounded-[24px] border-border/50 bg-background/60 backdrop-blur-xl shadow-2xl hover:border-primary/20 transition-all duration-500">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">User Experience</span>
              </div>
              <CardTitle className="text-2xl font-bold text-white">Display & Automation</CardTitle>
              <CardDescription className="text-zinc-400">Fine-tune how the extension interacts with your viewing experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Language */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Target Language</h4>
                    <p className="text-xs text-zinc-400">Summaries and captions will be in this language</p>
                  </div>
                </div>
                <Select
                  value={settings.targetLanguage}
                  onValueChange={(val) => handleChange("targetLanguage", val)}
                >
                  <SelectTrigger className="w-full md:w-[180px] h-10 bg-black/40 border-zinc-800/50 rounded-xl text-white">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white rounded-xl">
                    {TARGET_LANGUAGES.map(lang => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Auto-Generate</h4>
                      <p className="text-[10px] text-zinc-400">Process on video load</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.autoGenerate}
                    onCheckedChange={(checked) => handleChange("autoGenerate", checked)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Subtitles Overlay</h4>
                      <p className="text-[10px] text-zinc-400">Show on video player</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.showSubtitles}
                    onCheckedChange={(checked) => handleChange("showSubtitles", checked)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>

              {/* Typography */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Type className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Typography Control</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[11px] text-zinc-500 uppercase ml-1">Caption Size (Overlay)</Label>
                    <div className="flex bg-black/40 rounded-xl p-1 border border-zinc-800/50">
                      {['S', 'M', 'L'].map((size) => (
                        <button
                          key={size}
                          onClick={() => handleChange("captionFontSize", size)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                            settings.captionFontSize === size 
                              ? 'bg-primary text-white shadow-lg' 
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] text-zinc-500 uppercase ml-1">Summary Size (Sidepanel)</Label>
                    <div className="flex bg-black/40 rounded-xl p-1 border border-zinc-800/50">
                      {['S', 'M', 'L'].map((size) => (
                        <button
                          key={size}
                          onClick={() => handleChange("summaryFontSize", size)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                            settings.summaryFontSize === size 
                              ? 'bg-primary text-white shadow-lg' 
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <p className="text-zinc-600 text-[10px]">
            Better YouTube v1.0.0 &bull; Developed with ❤️ for YouTube Power Users
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;