import { useState, useEffect } from "react";
import { useServerContext } from "@/contexts/ServerContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Settings, ShoppingBag, Trophy, History, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface EconomySettings {
  id: number;
  serverId: string;
  currencyName: string | null;
  currencyEmoji: string | null;
  dailyAmount: number | null;
  messageReward: number | null;
  voiceRewardPerMin: number | null;
  messageRewardCooldown: number | null;
  isEnabled: boolean | null;
}

interface ShopItem {
  id: number;
  serverId: string;
  name: string;
  description: string | null;
  price: number;
  type: string;
  roleId: string | null;
  stock: number | null;
  isEnabled: boolean | null;
}

interface LeaderboardEntry {
  id: number;
  serverId: string;
  userId: string;
  balance: number | null;
  bank: number | null;
  totalEarned: number | null;
}

interface Transaction {
  id: number;
  serverId: string;
  userId: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export default function EconomyManager() {
  const { selectedServerId } = useServerContext();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<EconomySettings | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    price: 100,
    type: "item" as "role" | "item",
    roleId: "",
    stock: null as number | null,
    isEnabled: true,
  });

  useEffect(() => {
    if (selectedServerId) {
      fetchData();
    }
  }, [selectedServerId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [settingsRes, shopRes, leaderboardRes, transactionsRes] = await Promise.all([
        fetch(`/api/servers/${selectedServerId}/economy/settings`, { credentials: "include" }),
        fetch(`/api/servers/${selectedServerId}/economy/shop`, { credentials: "include" }),
        fetch(`/api/servers/${selectedServerId}/economy/leaderboard?limit=20`, { credentials: "include" }),
        fetch(`/api/servers/${selectedServerId}/economy/transactions?limit=50`, { credentials: "include" }),
      ]);

      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (shopRes.ok) setShopItems(await shopRes.json());
      if (leaderboardRes.ok) setLeaderboard(await leaderboardRes.json());
      if (transactionsRes.ok) setTransactions(await transactionsRes.json());
    } catch (error) {
      console.error("Failed to fetch economy data:", error);
      toast({ title: "Error", description: "Failed to load economy data", variant: "destructive" });
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${selectedServerId}/economy/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast({ title: "Success", description: "Economy settings saved!" });
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    }
    setSaving(false);
  };

  const openItemDialog = (item?: ShopItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name,
        description: item.description || "",
        price: item.price,
        type: item.type as "role" | "item",
        roleId: item.roleId || "",
        stock: item.stock,
        isEnabled: item.isEnabled ?? true,
      });
    } else {
      setEditingItem(null);
      setItemForm({
        name: "",
        description: "",
        price: 100,
        type: "item",
        roleId: "",
        stock: null,
        isEnabled: true,
      });
    }
    setItemDialogOpen(true);
  };

  const saveItem = async () => {
    setSaving(true);
    try {
      const url = editingItem 
        ? `/api/servers/${selectedServerId}/economy/shop/${editingItem.id}`
        : `/api/servers/${selectedServerId}/economy/shop`;
      
      const res = await fetch(url, {
        method: editingItem ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(itemForm),
      });

      if (res.ok) {
        toast({ title: "Success", description: editingItem ? "Item updated!" : "Item created!" });
        setItemDialogOpen(false);
        fetchData();
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save item", variant: "destructive" });
    }
    setSaving(false);
  };

  const deleteItem = async (id: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    
    try {
      const res = await fetch(`/api/servers/${selectedServerId}/economy/shop/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Success", description: "Item deleted!" });
        fetchData();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    }
  };

  if (!selectedServerId) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="p-8 text-center text-discord-muted">
          Please select a server to manage economy settings.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-discord-blue" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <span className="text-2xl">🪙</span>
            Economy System
          </CardTitle>
          <CardDescription className="text-discord-muted">
            Configure your server's virtual currency system
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="bg-discord-dark border border-discord-dark">
          <TabsTrigger value="settings" className="data-[state=active]:bg-discord-blue">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="shop" className="data-[state=active]:bg-discord-blue">
            <ShoppingBag className="h-4 w-4 mr-2" />
            Shop
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="data-[state=active]:bg-discord-blue">
            <Trophy className="h-4 w-4 mr-2" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="transactions" className="data-[state=active]:bg-discord-blue">
            <History className="h-4 w-4 mr-2" />
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card className="bg-discord-sidebar border-discord-dark">
            <CardHeader>
              <CardTitle className="text-white">Economy Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white">Enable Economy</Label>
                  <p className="text-sm text-discord-muted">Turn the economy system on or off</p>
                </div>
                <Switch
                  checked={settings?.isEnabled ?? true}
                  onCheckedChange={(checked) => setSettings(s => s ? { ...s, isEnabled: checked } : null)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Currency Name</Label>
                  <Input
                    value={settings?.currencyName || ""}
                    onChange={(e) => setSettings(s => s ? { ...s, currencyName: e.target.value } : null)}
                    placeholder="Coins"
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Currency Emoji</Label>
                  <Input
                    value={settings?.currencyEmoji || ""}
                    onChange={(e) => setSettings(s => s ? { ...s, currencyEmoji: e.target.value } : null)}
                    placeholder="🪙"
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Daily Reward Amount</Label>
                  <Input
                    type="number"
                    value={settings?.dailyAmount || 100}
                    onChange={(e) => setSettings(s => s ? { ...s, dailyAmount: parseInt(e.target.value) || 0 } : null)}
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Message Reward</Label>
                  <Input
                    type="number"
                    value={settings?.messageReward || 5}
                    onChange={(e) => setSettings(s => s ? { ...s, messageReward: parseInt(e.target.value) || 0 } : null)}
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                  <p className="text-xs text-discord-muted">Coins earned per message</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Voice Reward (per minute)</Label>
                  <Input
                    type="number"
                    value={settings?.voiceRewardPerMin || 2}
                    onChange={(e) => setSettings(s => s ? { ...s, voiceRewardPerMin: parseInt(e.target.value) || 0 } : null)}
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Message Cooldown (seconds)</Label>
                  <Input
                    type="number"
                    value={settings?.messageRewardCooldown || 60}
                    onChange={(e) => setSettings(s => s ? { ...s, messageRewardCooldown: parseInt(e.target.value) || 0 } : null)}
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                  <p className="text-xs text-discord-muted">Time between message rewards</p>
                </div>
              </div>

              <Button 
                onClick={saveSettings} 
                disabled={saving}
                className="bg-discord-blue hover:bg-discord-blue/80"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shop">
          <Card className="bg-discord-sidebar border-discord-dark">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Shop Items</CardTitle>
              <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => openItemDialog()} className="bg-discord-blue hover:bg-discord-blue/80">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-discord-sidebar border-discord-dark">
                  <DialogHeader>
                    <DialogTitle className="text-white">
                      {editingItem ? "Edit Item" : "Add New Item"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-white">Name</Label>
                      <Input
                        value={itemForm.name}
                        onChange={(e) => setItemForm(f => ({ ...f, name: e.target.value }))}
                        className="bg-discord-dark border-discord-dark text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Description</Label>
                      <Textarea
                        value={itemForm.description}
                        onChange={(e) => setItemForm(f => ({ ...f, description: e.target.value }))}
                        className="bg-discord-dark border-discord-dark text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-white">Price</Label>
                        <Input
                          type="number"
                          value={itemForm.price}
                          onChange={(e) => setItemForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                          className="bg-discord-dark border-discord-dark text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white">Type</Label>
                        <Select 
                          value={itemForm.type} 
                          onValueChange={(v) => setItemForm(f => ({ ...f, type: v as "role" | "item" }))}
                        >
                          <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-discord-dark border-discord-dark">
                            <SelectItem value="item">Item</SelectItem>
                            <SelectItem value="role">Role</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {itemForm.type === "role" && (
                      <div className="space-y-2">
                        <Label className="text-white">Role ID</Label>
                        <Input
                          value={itemForm.roleId}
                          onChange={(e) => setItemForm(f => ({ ...f, roleId: e.target.value }))}
                          placeholder="Discord Role ID"
                          className="bg-discord-dark border-discord-dark text-white"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="text-white">Stock (leave empty for unlimited)</Label>
                      <Input
                        type="number"
                        value={itemForm.stock ?? ""}
                        onChange={(e) => setItemForm(f => ({ 
                          ...f, 
                          stock: e.target.value ? parseInt(e.target.value) : null 
                        }))}
                        placeholder="Unlimited"
                        className="bg-discord-dark border-discord-dark text-white"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={itemForm.isEnabled}
                        onCheckedChange={(checked) => setItemForm(f => ({ ...f, isEnabled: checked }))}
                      />
                      <Label className="text-white">Enabled</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setItemDialogOpen(false)}>Cancel</Button>
                    <Button onClick={saveItem} disabled={saving || !itemForm.name} className="bg-discord-blue">
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {shopItems.length === 0 ? (
                <p className="text-center text-discord-muted py-8">
                  No shop items yet. Add one to get started!
                </p>
              ) : (
                <div className="space-y-3">
                  {shopItems.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-discord-dark border border-discord-dark"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={item.type === "role" ? "text-yellow-500" : "text-blue-400"}>
                            {item.type === "role" ? "👑" : "📦"}
                          </span>
                          <span className="text-white font-medium">{item.name}</span>
                          {!item.isEnabled && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Disabled</span>
                          )}
                        </div>
                        <p className="text-sm text-discord-muted mt-1">{item.description || "No description"}</p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span className="text-discord-muted">
                            💰 {item.price.toLocaleString()} {settings?.currencyName || "Coins"}
                          </span>
                          {item.stock !== null && (
                            <span className="text-discord-muted">📦 {item.stock} left</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openItemDialog(item)}
                          className="text-discord-muted hover:text-white"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => deleteItem(item.id)}
                          className="text-discord-muted hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Card className="bg-discord-sidebar border-discord-dark">
            <CardHeader>
              <CardTitle className="text-white">💰 Top 20 Richest Users</CardTitle>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <p className="text-center text-discord-muted py-8">
                  No users have earned any coins yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry, index) => {
                    const total = (entry.balance || 0) + (entry.bank || 0);
                    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                    return (
                      <div 
                        key={entry.id} 
                        className="flex items-center justify-between p-3 rounded-lg bg-discord-dark"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl w-8">{medal}</span>
                          <span className="text-white font-mono">{entry.userId}</span>
                        </div>
                        <span className="text-yellow-400 font-medium">
                          {settings?.currencyEmoji || "🪙"} {total.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="bg-discord-sidebar border-discord-dark">
            <CardHeader>
              <CardTitle className="text-white">📜 Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-center text-discord-muted py-8">
                  No transactions recorded yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {transactions.map((tx) => (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-discord-dark"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {tx.amount >= 0 ? "+" : ""}{tx.amount.toLocaleString()}
                          </span>
                          <span className="text-xs bg-discord-sidebar px-2 py-0.5 rounded text-discord-muted">
                            {tx.type}
                          </span>
                        </div>
                        <p className="text-xs text-discord-muted mt-1">
                          {tx.description || "No description"} • User: {tx.userId}
                        </p>
                      </div>
                      <span className="text-xs text-discord-muted">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
