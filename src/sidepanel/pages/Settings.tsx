import { RECOMMENDED_REFINER_MODELS, RECOMMENDED_SUMMARIZER_MODELS, TARGET_LANGUAGES } from "@/lib/constants";
import { getStorageValues, setStorageValue } from "@/lib/storage";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/components/ui/card";
import { EditableCombobox } from "@ui/components/ui/editable-combobox";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Switch } from "@ui/components/ui/switch";
import { useToast } from "@ui/hooks/use-toast";
import { ArrowLeft, Cpu, Globe, Key, Settings as SettingsIcon, ShieldCheck, Sparkles, Type, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  "fastMode",
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
  fastMode: false,
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
      <div className="app-shell flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
            <SettingsIcon className="h-6 w-6 text-primary animate-spin-slow" />
          </div>
          <p className="text-muted-foreground font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell pb-20">
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
              <h1 className="text-4xl font-black tracking-tight text-foreground">Settings</h1>
              <p className="text-muted-foreground mt-1">Configure your AI models and display preferences</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 fade-in-up stagger-1">
          {/* API Configuration */}
          <Card className="rounded-[24px] hover:border-primary/20 transition-all duration-500">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Key className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">API Configuration</span>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">Authentication</CardTitle>
              <CardDescription>Manage your access keys for transcription and AI services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="scrapeCreatorsApiKey" className="text-sm font-semibold">Scrape Creators API Key</Label>
                  <a href="https://scrapecreators.com" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Get Key</a>
                </div>
                <Input
                  id="scrapeCreatorsApiKey"
                  type="password"
                  value={settings.scrapeCreatorsApiKey}
                  onChange={(e) => handleChange("scrapeCreatorsApiKey", e.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="..."
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="openRouterApiKey" className="text-sm font-semibold">OpenRouter API Key</Label>
                  <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Get Key</a>
                </div>
                <Input
                  id="openRouterApiKey"
                  type="password"
                  value={settings.openRouterApiKey}
                  onChange={(e) => handleChange("openRouterApiKey", e.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="sk-or-v1-..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Model Configuration */}
          <Card className="rounded-[24px] hover:border-primary/20 transition-all duration-500">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Model Configuration</span>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">Model Selection</CardTitle>
              <CardDescription>Choose which models power your summaries and captions</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="summarizerModel" className="text-sm font-semibold">Analysis & Summary Model</Label>
                <EditableCombobox
                  value={settings.summarizerModel}
                  onChange={(val) => handleChange("summarizerModel", val)}
                  options={RECOMMENDED_SUMMARIZER_MODELS.map(m => ({ value: m.value, label: m.label }))}
                  placeholder="Select or type model..."
                  inputClassName="h-12 rounded-xl"
                  contentClassName="rounded-xl"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="refinerModel" className="text-sm font-semibold">Caption Refinement Model</Label>
                <EditableCombobox
                  value={settings.refinerModel}
                  onChange={(val) => handleChange("refinerModel", val)}
                  options={RECOMMENDED_REFINER_MODELS.map(m => ({ value: m.value, label: m.label }))}
                  placeholder="Select or type model..."
                  inputClassName="h-12 rounded-xl"
                  contentClassName="rounded-xl"
                />
              </div>
            </CardContent>
          </Card>

          {/* User Experience */}
          <Card className="rounded-[24px] hover:border-primary/20 transition-all duration-500">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">User Experience</span>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">Display & Automation</CardTitle>
              <CardDescription>Fine-tune how the extension interacts with your viewing experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Language */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/30 border border-border/60">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">Target Language</h4>
                    <p className="text-xs text-muted-foreground">Summaries and captions will be in this language</p>
                  </div>
                </div>
                <Select
                  value={settings.targetLanguage}
                  onValueChange={(val) => handleChange("targetLanguage", val)}
                >
                  <SelectTrigger className="w-full md:w-[180px] h-10 rounded-xl">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {TARGET_LANGUAGES.map(lang => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">Auto-Generate</h4>
                      <p className="text-[10px] text-muted-foreground">Process on video load</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.autoGenerate}
                    onCheckedChange={(checked) => handleChange("autoGenerate", checked)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">Subtitles Overlay</h4>
                      <p className="text-[10px] text-muted-foreground">Show on video player</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.showSubtitles}
                    onCheckedChange={(checked) => handleChange("showSubtitles", checked)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">Quality Check</h4>
                      <p className="text-[10px] text-muted-foreground">Enable refinement loop (Slower)</p>
                    </div>
                  </div>
                  <Switch
                    checked={!settings.fastMode}
                    onCheckedChange={(checked) => handleChange("fastMode", !checked)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Type className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Font Size</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[11px] text-muted-foreground uppercase ml-1">Caption Overlay</Label>
                    <div className="flex bg-muted/30 rounded-xl p-1 border border-border/60">
                      {['S', 'M', 'L'].map((size) => (
                        <button
                          key={size}
                          onClick={() => handleChange("captionFontSize", size)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                            settings.captionFontSize === size 
                              ? 'bg-primary text-white shadow-lg' 
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] text-muted-foreground uppercase ml-1">Analysis Panel</Label>
                    <div className="flex bg-muted/30 rounded-xl p-1 border border-border/60">
                      {['S', 'M', 'L'].map((size) => (
                        <button
                          key={size}
                          onClick={() => handleChange("summaryFontSize", size)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                            settings.summaryFontSize === size 
                              ? 'bg-primary text-white shadow-lg' 
                              : 'text-muted-foreground hover:text-foreground'
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
      </div>
    </div>
  );
};

export default Settings;
