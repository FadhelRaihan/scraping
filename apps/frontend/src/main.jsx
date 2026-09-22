import React, { useEffect, useState } from "react";
import History from './history.jsx';
import {Templates,ContactLead} from './contacting.jsx';
import ScrapeConfig from './scrape-config.jsx';
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
} from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  Globe,
  ScanSearch,
  LogOut,
  RefreshCw,
  Download,
  Play,
  Square,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./style.css";
const labels = {
  new: "Baru",
  qualified: "Potensial",
  contacted: "Dihubungi",
  replied: "Membalas",
  meeting: "Meeting",
  proposal_sent: "Proposal",
  won: "Deal",
  lost: "Ditolak",
  do_not_contact: "Jangan hubungi",
};
const date = (v) => (v ? new Date(v).toLocaleString("id-ID") : "—");
const num = (v) => new Intl.NumberFormat("id-ID").format(v ?? 0);
async function api(path, options = {}) {
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path != "/auth/login")
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error || "Permintaan gagal");
  }
  return data;
}
function ErrorBox({ error }) {
  return error ? (
    <Alert variant="destructive">
      <AlertTitle>Operasi belum berhasil</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}
function NoData() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Belum ada data</EmptyTitle>
        <EmptyDescription>
          Mulai scraping atau sesuaikan filter pencarian.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
function Pick({ label, value, onChange, options, all = true }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <NativeSelect
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {all && <NativeSelectOption value="">Semua</NativeSelectOption>}
        {options.map(([v, t]) => (
          <NativeSelectOption key={v} value={v}>
            {t}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
function QualityDetails({quality:q={}}){return <Card><CardHeader><CardTitle>Kualitas data</CardTitle><CardDescription>Metadata yang tersedia saat scraping.</CardDescription></CardHeader><CardContent><dl className="facts">{[['Tanggal ulasan',q.latest_review_at||q.latest_review_raw||'—'],['Presisi',q.review_date_precision],['Jumlah ulasan',q.jumlah_ulasan??'—'],['Kategori Maps',q.kategori_maps?.join(', ')],['Kategori pencarian',q.kategori_pencarian?.join(', ')],['Status website',q.website_status],['Telepon standar',q.telepon_normalized],['Operasional',q.status_operasional],['Jam buka',q.jam_buka_raw],['Koordinat',q.latitude!=null?`${q.latitude}, ${q.longitude}`:null]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Belum tersedia'}</dd></div>)}</dl></CardContent></Card>}
function App() {
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
    const expire = () => setUser(null);
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  if (user === undefined)
    return (
      <div className="p-12">
        <Skeleton className="h-20 w-full" />
      </div>
    );
  if (!user) return <Login done={setUser} />;
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-6">
          <NavLink to="/overview" className="font-bold text-xl tracking-tight">
            ProjectAdmin<span className="text-primary">.</span>
          </NavLink>
          <p className="text-xs text-muted-foreground">Ruang kerja pribadi</p>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <Navigation />
        </SidebarContent>
        <SidebarFooter className="p-4">
          <Separator />
          <p className="text-xs truncate py-2">{user.email}</p>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await api("/auth/logout", { method: "POST" });
                setUser(null);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <LogOut data-icon="inline-start" />
            Keluar
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex items-center gap-3 border-b p-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm text-muted-foreground">
            ProjectAdmin / Workspace
          </span>
        </header>
        <div className="px-6">
          <ErrorBox error={error} />
        </div>
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/leads" element={<Leads key="all" />} />
          <Route
            path="/web-opportunities"
            element={<Leads key="web" opportunities />}
          />
          <Route path="/scraping" element={<Scraping />} />
          <Route path="/templates" element={<Templates/>}/>
          <Route path="/scraping/history" element={<History/>}/>
          <Route path="/scraping/coverage" element={<History/>}/>
          <Route path="/scraping/compare" element={<History/>}/>
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </SidebarInset>
    </SidebarProvider>
  );
}
function Navigation() {
  const location = useLocation();
  return (
    <>
      <SidebarMenu>
        {[
          ["/overview", "Ringkasan", LayoutDashboard],
          ["/leads", "Database Lead", Database],
          ["/web-opportunities", "Peluang Web", Globe],
          ["/scraping", "Scraping", ScanSearch],
          ["/scraping/history", "Histori & Coverage", Database],
          ["/templates", "Template pesan", Globe],
        ].map(([path, label, Icon]) => (
          <SidebarMenuItem key={path}>
            <SidebarMenuButton asChild isActive={location.pathname === path}>
              <NavLink to={path}>
                <Icon />
                <span>{label}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
      {location.pathname === "/scraping" && <JobOutcomes />}
    </>
  );
}
function JobOutcomes() {
  const [progress, setProgress] = useState(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      api("/scraping/status")
        .then((j) => {
          if (active) setProgress(j?.progress);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!progress) return null;
  return (
    <Card className="m-2">
      <CardHeader>
        <CardTitle>Hasil sesi ini</CardTitle>
        <CardDescription>Per tempat unik</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        {[
          ["recent", "Lolos"],
          ["old", "Ulasan lama"],
          ["unknown", "Belum pasti"],
          ["outside_region", "Wilayah tidak sesuai"],
          ["error", "Error"],
        ].map(([key, label]) => (
          <div className="flex justify-between gap-2" key={key}>
            <span>{label}</span>
            <Badge variant="secondary">{num(progress.outcomes?.[key])}</Badge>
          </div>
        ))}
        <Separator />
        <p>Upsert diakui: {num(progress.sync?.imported)}</p>
        <p>Menunggu sync: {num(progress.sync?.pending)}</p>
        <p>Payload ditolak: {num(progress.sync?.rejected)}</p>
      </CardContent>
    </Card>
  );
}
function Login({ done }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      done(
        await api("/auth/login", {
          method: "POST",
          body: JSON.stringify(
            Object.fromEntries(new FormData(e.currentTarget)),
          ),
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-grid">
      <section className="login-story">
        <p className="font-bold text-xl">ProjectAdmin.</p>
        <h1>
          Data tertata.
          <br />
          Langkah terarah.
        </h1>
        <p>
          Kelola lead, pantau aktivitas, dan temukan peluang dalam satu ruang
          kerja.
        </p>
      </section>
      <section className="login-form">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Selamat datang kembali</CardTitle>
            <CardDescription>Masuk ke workspace Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <ErrorBox error={error} />
                <Button disabled={busy}>Masuk ke dashboard</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
function Overview() {
  const [stats, setStats] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      api("/stats/overview", { signal: c.signal }),
      api("/scraping/status", { signal: c.signal }),
    ])
      .then(([s, j]) => {
        setStats(s);
        setJob(j);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [refresh]);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Ringkasan</h1>
          <p>Gambaran data dan perkembangan workspace Anda.</p>
        </div>
        <Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>
          <RefreshCw data-icon="inline-start" />
          Refresh
        </Button>
      </div>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ["Seluruh lead", stats?.total],
          ["Lead baru", stats?.new],
          ["Tanpa website", stats?.without_website],
          ["Berhasil deal", stats?.won],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
            </CardHeader>
            <CardContent>
              {stats ? (
                <p className="metric">{num(value)}</p>
              ) : (
                <Skeleton className="h-10 w-20" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        {[
          ["Sebaran wilayah", stats?.cities],
          ["Status prospek", stats?.pipeline],
          ["Rating bisnis", stats?.ratings],
        ].map(([title, items]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {items?.length ? (
                items.slice(0, 8).map((item) => (
                  <div key={item.label} className="flex flex-col gap-2">
                    <div className="flex justify-between gap-3 text-sm">
                      <span>
                        {labels[item.label] ||
                          item.label ||
                          "Belum teridentifikasi"}
                      </span>
                      <span>{num(item.count)}</span>
                    </div>
                    <Progress value={(item.count / (stats.total || 1)) * 100} />
                  </div>
                ))
              ) : (
                <NoData />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Aktivitas scraping terakhir</CardTitle>
          <CardDescription>
            {job
              ? `${date(job.started_at)} · ${job.status}`
              : "Belum ada scraping dari website."}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <NavLink to="/scraping">
              Buka Scraping
              <ArrowUpRight data-icon="inline-end" />
            </NavLink>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
const defaults = {
  q: "",
  kota: "",
  kategori: "",
  status: "",
  website: "",
  phone: "",
  rating: "",
  from: "",
  to: "",
  sort: "latest",
  page: 1,
};
function Leads({ opportunities = false }) {
  const [f, setF] = useState({
    ...defaults,
    website: opportunities ? "no" : "",
  });
  const [list, setList] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const query = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v !== ""),
  ).toString();
  useEffect(() => {
    api("/stats/overview")
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    const timer = setTimeout(
      () =>
        api(`/leads?${query}`, { signal: c.signal })
          .then(setList)
          .catch((e) => {
            if (e.name !== "AbortError") setError(e.message);
          })
          .finally(() => {
            if (!c.signal.aborted) setBusy(false);
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query, refresh]);
  const change = (k, v) => setF((f) => ({ ...f, [k]: v, page: 1 }));
  async function exportCsv() {
    try {
      const r = await fetch(`/api/leads/export?${query}`);
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "ProjectAdmin-leads.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{opportunities ? "Peluang Web" : "Database Lead"}</h1>
          <p>
            {opportunities
              ? "Bisnis dengan website yang belum tercantum di Maps."
              : "Cari, kenali, dan kelola seluruh lead Anda."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setRefresh((v) => v + 1)}
            aria-label="Refresh data"
          >
            <RefreshCw />
          </Button>
          <Button onClick={exportCsv} disabled={busy}>
            <Download data-icon="inline-start" />
            Ekspor CSV
          </Button>
        </div>
      </div>
      <ErrorBox error={error} />
      {opportunities && (
        <Card>
          <CardHeader>
            <CardDescription>Peluang sesuai filter</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="metric">{num(list?.total)}</p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Filter data</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="filters">
            <Pick label="Riwayat kontak" value={f.contact||''} onChange={v=>change('contact',v)} options={[["not_contacted","Belum dihubungi"],["contacted","Sudah dihubungi"],["opted_out","Jangan dihubungi"]]}/>
            <Pick label="Presisi tanggal" value={f.precision||''} onChange={v=>change('precision',v)} options={['exact','relative','ambiguous','unknown'].map(v=>[v,v])}/>
            <Pick label="Status operasional" value={f.operational||''} onChange={v=>change('operational',v)} options={['open','temporarily_closed','permanently_closed','unknown'].map(v=>[v,v])}/>
            <Pick label="Kualitas website" value={f.website_status||''} onChange={v=>change('website_status',v)} options={['listed','missing','invalid','unknown'].map(v=>[v,v])}/>
            <Field><FieldLabel htmlFor="min_reviews">Minimum ulasan</FieldLabel><Input id="min_reviews" type="number" min="0" value={f.min_reviews||''} onChange={e=>change('min_reviews',e.target.value)}/></Field>
            <Field>
              <FieldLabel htmlFor="search">Cari bisnis</FieldLabel>
              <Input
                id="search"
                type="search"
                placeholder="Nama atau alamat"
                value={f.q}
                onChange={(e) => change("q", e.target.value)}
              />
            </Field>
            <Pick
              label="Wilayah"
              value={f.kota}
              onChange={(v) => change("kota", v)}
              options={(stats?.cities ?? [])
                .filter((x) => x.label)
                .map((x) => [x.label, x.label])}
            />
            <Pick
              label="Status"
              value={f.status}
              onChange={(v) => change("status", v)}
              options={Object.entries(labels)}
            />
            {!opportunities && (
              <Pick
                label="Website"
                value={f.website}
                onChange={(v) => change("website", v)}
                options={[
                  ["no", "Belum tercantum"],
                  ["yes", "Tercantum"],
                ]}
              />
            )}
            <Pick
              label="Kategori"
              value={f.kategori}
              onChange={(v) => change("kategori", v)}
              options={(stats?.categories ?? [])
                .filter(Boolean)
                .map((x) => [x, x])}
            />
            <Pick
              label="Telepon"
              value={f.phone}
              onChange={(v) => change("phone", v)}
              options={[
                ["yes", "Tersedia"],
                ["no", "Tidak tersedia"],
              ]}
            />
            <Field>
              <FieldLabel htmlFor="rating">Rating minimum</FieldLabel>
              <Input
                id="rating"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={f.rating}
                onChange={(e) => change("rating", e.target.value)}
              />
            </Field>
            {[
              ["from", "Dari tanggal"],
              ["to", "Sampai tanggal"],
            ].map(([k, label]) => (
              <Field key={k}>
                <FieldLabel htmlFor={k}>{label}</FieldLabel>
                <Input
                  id={k}
                  type="date"
                  value={f[k]}
                  onChange={(e) => change(k, e.target.value)}
                />
              </Field>
            ))}
            <Pick
              label="Urutkan"
              all={false}
              value={f.sort}
              onChange={(v) => change("sort", v)}
              options={[
                ["latest", "Scraping terbaru"],
                ["oldest", "Scraping terlama"],
                ["name", "Nama A–Z"],
                ["rating", "Rating tertinggi"],
              ]}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button
            variant="ghost"
            onClick={() =>
              setF({ ...defaults, website: opportunities ? "no" : "" })
            }
          >
            Reset filter
          </Button>
        </CardFooter>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{num(list?.total)} lead</CardTitle>
          <CardDescription>
            {busy ? "Memuat data…" : "Klik nama bisnis untuk membuka detail."}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Bisnis",
                  "Wilayah",
                  "Rating",
                  "Kontak",
                  "Website",
                  "Ulasan terbaru",
                  "Status",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list?.items.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Button
                      variant="link"
                      className="px-0"
                      onClick={() => setId(l.id)}
                    >
                      {l.nama}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {l.kategori} · {date(l.scraped_at)}
                    </p>
                  </TableCell>
                  <TableCell>{l.kota || "—"}</TableCell>
                  <TableCell>{l.rating || "—"}</TableCell>
                  <TableCell>{l.telepon || "—"}</TableCell>
                  <TableCell>
                    {l.website ? (
                      <Button asChild variant="link">
                        <a href={l.website} target="_blank" rel="noreferrer">
                          Website ↗
                        </a>
                      </Button>
                    ) : (
                      <Badge variant="secondary">Belum tercantum</Badge>
                    )}
                  </TableCell>
                  <TableCell>{l.ulasan_terbaru}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{labels[l.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!busy && !list?.items.length && <NoData />}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Halaman {f.page} / {Math.max(1, Math.ceil((list?.total || 0) / 25))}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || f.page === 1}
              onClick={() => setF((f) => ({ ...f, page: f.page - 1 }))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              disabled={busy || f.page * 25 >= (list?.total || 0)}
              onClick={() => setF((f) => ({ ...f, page: f.page + 1 }))}
            >
              Berikutnya
            </Button>
          </div>
        </CardFooter>
      </Card>
      {id && (
        <Detail
          id={id}
          close={() => setId(null)}
          changed={() => setRefresh((v) => v + 1)}
        />
      )}
    </main>
  );
}
function Detail({ id, close, changed }) {
  const [l, setL] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/leads/${id}`)
      .then(setL)
      .catch((e) => setError(e.message));
  }, [id]);
  async function mutate(path, method, body) {
    setBusy(true);
    try {
      await api(`/leads/${id}${path}`, { method, body: JSON.stringify(body) });
      setL(await api(`/leads/${id}`));
      if (path === "/notes") setNote("");
      changed();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{l?.nama || "Memuat detail"}</SheetTitle>
          <SheetDescription>{l?.alamat || "Profil lead"}</SheetDescription>
        </SheetHeader>
        <div className="p-6 flex flex-col gap-6">
          <ErrorBox error={error} />
          {l ? (
            <>
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <a href={l.url_maps} target="_blank" rel="noreferrer">
                    Google Maps ↗
                  </a>
                </Button>
                {l.website && (
                  <Button variant="outline" asChild>
                    <a href={l.website} target="_blank" rel="noreferrer">
                      Website ↗
                    </a>
                  </Button>
                )}
              </div>
              <ContactLead lead={l} changed={changed}/>
              <QualityDetails quality={l.quality}/>
              <dl className="facts">
                {[
                  ["Telepon", l.telepon],
                  ["Rating", l.rating],
                  ["Wilayah", l.kota],
                  ["Label", l.label_pencarian],
                  ["Ulasan saat scraping", l.ulasan_terbaru],
                  ["Scraping", date(l.scraped_at)],
                ].map(([a, b]) => (
                  <div key={a}>
                    <dt>{a}</dt>
                    <dd>{b || "—"}</dd>
                  </div>
                ))}
              </dl>
              <Separator />
              <fieldset disabled={busy}>
                <Pick
                  label="Pipeline"
                  all={false}
                  value={l.status}
                  onChange={(status) => mutate("/status", "PATCH", { status })}
                  options={Object.entries(labels)}
                />
              </fieldset>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  mutate("/notes", "POST", { content: note });
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="note">Catatan baru</FieldLabel>
                    <Textarea
                      id="note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={5000}
                      required
                    />
                  </Field>
                  <Button disabled={busy || !note.trim()}>
                    Simpan catatan
                  </Button>
                </FieldGroup>
              </form>
              {l.notes.map((n) => (
                <Card key={n.id}>
                  <CardHeader>
                    <CardDescription>{date(n.created_at)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="note text-sm">{n.content}</p>
                  </CardContent>
                </Card>
              ))}
              <Separator />
              <h2>Riwayat status</h2>
              {l.history.map((h) => (
                <p key={h.id} className="text-sm">
                  {labels[h.old_status]} → {labels[h.new_status]}
                  <span className="block text-xs text-muted-foreground">
                    {date(h.created_at)}
                  </span>
                </p>
              ))}
            </>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
function Scraping() {
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const j = await api("/scraping/status");
        if (alive) setJob(j);
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const active = ["queued", "running", "stopping"].includes(job?.status);
  async function action(action) {
    setBusy(true);
    setError("");
    try {
      setJob(await api(`/scraping/${action}`, { method: "POST", body: "{}" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const p = job?.progress || {};
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Scraping</h1>
          <p>Jalankan dan pantau pengumpulan data dari workspace.</p>
        </div>
        <Badge variant="outline">{job?.status || "idle"}</Badge>
      </div>
      <ErrorBox error={error} />
      <ScrapeConfig active={active} onStarted={setJob}/>
      <Card>
        <CardHeader>
          <CardTitle>Kontrol scraping</CardTitle>
          <CardDescription>
            Serial · Durasi sesi: {job?.requested_hours || '—'} jam
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex gap-3 flex-wrap">
            <Button disabled onClick={() => action("start")}>
              <Play data-icon="inline-start" />
              Mulai Scraping
            </Button>
            <Button
              variant="outline"
              disabled={busy || !active || job?.status === "stopping"}
              onClick={() => action("stop")}
            >
              <Square data-icon="inline-start" />
              {job?.status === "stopping"
                ? "Menghentikan…"
                : "Hentikan Scraping"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Mulai: {date(job?.started_at)} · Heartbeat:{" "}
            {date(job?.last_heartbeat)}
          </p>
          {active && Date.now() - Date.parse(job.last_heartbeat) > 120000 && (
            <Alert>
              <AlertTitle>Heartbeat terlambat</AlertTitle>
              <AlertDescription>
                Worker mungkin tertahan. Status belum dianggap selesai.
              </AlertDescription>
            </Alert>
          )}
          <div>
            <p className="text-sm mb-3">
              Pencarian {p.queries_completed || 0} / {p.queries_total || 162}
            </p>
            <Progress
              value={
                ((p.queries_completed || 0) / (p.queries_total || 162)) * 100
              }
            />
          </div>
          <p className="text-sm break-words">
            {p.query || "Belum ada pencarian aktif"}
          </p>
          {job?.stop_reason && (
            <Alert>
              <AlertTitle>Catatan sesi</AlertTitle>
              <AlertDescription>{job.stop_reason}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ["Ditemukan", p.places_found],
          ["Diproses", p.places_processed],
          ["Lolos filter", p.leads_valid],
          ["Gagal", p.errors],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="metric">{num(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Log aktivitas</CardTitle>
          <CardDescription>
            150 pesan terakhir. Progress mencakup checkpoint yang dilanjutkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {job?.logs?.length ? (
            <div className="log" role="log">
              {job.logs.map((l, i) => (
                <p key={i}>
                  {date(l.at)} [{l.level}] {l.message}
                </p>
              ))}
            </div>
          ) : (
            <NoData />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </BrowserRouter>,
);
