"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, ClipboardList, Clock, FileText, Target, Trophy, type LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { BarsChart } from "@/components/charts/BarsChart"
import { ChartCard } from "@/components/charts/ChartCard"
import { DonutChart } from "@/components/charts/DonutChart"
import { EmptyChart } from "@/components/charts/EmptyChart"
import { RankedBarsCard } from "@/components/charts/RankedBarsCard"
import { TrendLineChart } from "@/components/charts/TrendLineChart"
import { colorAt } from "@/components/charts/palette"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { DashboardKpis, type DashboardKpiItem } from "@/components/dashboard/DashboardKpis"
import { apiErrorMessage } from "@/lib/api"
import { businessSpaceHref, type BusinessSpaceSlug } from "../../constants"
import { BUSINESS_DASHBOARD_PERIOD_LABELS, BUSINESS_DASHBOARD_PERIODS, bucketLabel } from "../../dashboard-period"
import { formatMoney } from "../../format"
import type { BusinessDashboardDto, DashboardCategorySlice } from "../../types"
import { useBusinessDashboard, useBusinessDashboardPeriod } from "../../hooks/useBusinessSpace"
import { CurrentGoalHighlight } from "./GoalProgressCard"
import { businessSubtitle, useBusinessSpace } from "./BusinessSpaceLayout"
import { BusinessAvatar } from "../BusinessAvatar"
import { usePermissions } from "@nandobfer/perfix/react"
import { canSeeSpaceSection } from "./space-nav"

type CountKey = keyof BusinessDashboardDto["counts"]

const SHORTCUTS: { slug: BusinessSpaceSlug; label: string; icon: LucideIcon; count?: CountKey; text?: (count: number) => string }[] = [
    { slug: "ficha", label: "Ficha do negócio", icon: ClipboardList },
    { slug: "atividades", label: "Atividades", icon: Clock, count: "activities" },
    { slug: "metas", label: "Metas", icon: Target, count: "goals", text: (count) => (count ? "Meta atual definida" : "Sem meta ativa") },
    { slug: "documentos", label: "Documentos", icon: FileText, count: "documents" },
    { slug: "sucessos", label: "Sucessos", icon: Trophy, count: "successes" },
]

const PERIOD_OPTIONS = BUSINESS_DASHBOARD_PERIODS.map((value) => ({ value, label: BUSINESS_DASHBOARD_PERIOD_LABELS[value] }))
const NO_REVENUE = "Sem faturamento no período: ele vem dos trabalhos pagos."
const formatCount = (value: number) => Math.round(value).toLocaleString("pt-BR")
const formatPercent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
/** Valores dos gráficos em unidades da moeda (o eixo fica legível); o tooltip formata. */
const units = (cents: number | null) => (cents === null ? null : cents / 100)

function kpiItems(data: BusinessDashboardDto): DashboardKpiItem[] {
    const money = (value: number) => formatMoney(Math.round(value), data.currency)
    const period = BUSINESS_DASHBOARD_PERIOD_LABELS[data.period].toLowerCase()
    const shown = data.visible
    return [
        shown.revenue && { label: "Faturamento bruto", hint: `No período · ${period}`, value: data.kpis.revenueCents, formatter: money },
        shown.goals && { label: "Meta atual", hint: data.goal ? "% atingido na janela atual" : "Sem meta ativa", value: data.kpis.currentGoalPercent ?? 0, formatter: data.kpis.currentGoalPercent === null ? () => "—" : formatPercent },
        shown.activities && { label: "Atividades ativas", hint: "Situação atual", value: data.kpis.activeActivities, formatter: formatCount },
        shown.activities && { label: "Valor/hora médio", hint: "Das atividades ativas", value: data.kpis.averageRateCents ?? 0, formatter: data.kpis.averageRateCents === null ? () => "—" : money },
        shown.documents && { label: "Documentos", hint: "Situação atual", value: data.kpis.documents, formatter: formatCount },
        shown.successes && { label: "Sucessos", hint: `No período · ${period}`, value: data.kpis.successesInPeriod, formatter: formatCount },
    ].filter((item): item is DashboardKpiItem => Boolean(item))
}

function CategoryDonut({ title, description, slices, ariaLabel }: { title: string; description: string; slices: DashboardCategorySlice[]; ariaLabel: string }) {
    const rows = slices.map((slice, index) => ({ ...slice, fill: colorAt(index) }))
    const config: ChartConfig = Object.fromEntries(rows.map((row) => [row.name, { label: row.name, color: row.fill }]))
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    return (
        <ChartCard title={title} description={description}>
            {!rows.length ? (
                <EmptyChart message="Nada cadastrado ainda." />
            ) : (
                <DonutChart
                    data={rows}
                    nameKey="name"
                    valueKey="count"
                    config={config}
                    ariaLabel={ariaLabel}
                    valueFormatter={formatCount}
                    centerValue={formatCount(total)}
                    centerLabel="Total"
                    table={{ columns: [{ key: "name", label: "Categoria" }, { key: "count", label: "Quantidade" }], rows }}
                />
            )}
        </ChartCard>
    )
}

function DashboardCharts({ data }: { data: BusinessDashboardDto }) {
    const money = (value: number) => formatMoney(Math.round(value * 100), data.currency)
    const perHour = (value: number) => `${money(value)}/h`
    const xLabel = (value: string) => bucketLabel(value)
    const rateRows = data.charts.activityRates.map((row) => ({ name: row.name, rate: units(row.rateCents) }))
    const successRows = data.charts.successes.map((row) => ({ ...row, label: bucketLabel(row.bucket) }))
    const trend = data.charts.rateTrend
    const trendRows = trend.rows.map((row) => ({ ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "bucket" ? value : units(value as number | null)])), label: bucketLabel(String(row.bucket)) }))
    const trendSeries = trend.activities.map((activity, index) => ({ key: activity.key, label: activity.name, color: colorAt(index) }))
    const revenueRows = data.charts.revenue.map((row) => ({ bucket: row.bucket, label: bucketLabel(row.bucket), revenue: units(row.revenueCents), target: units(row.targetCents) }))
    const pointLabel = data.granularity === "day" ? "Dia" : "Mês"

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {data.visible.revenue && (
            <ChartCard title="Faturamento bruto × meta mensal" description="Por mês do período (trabalhos pagos, pela data do pagamento)">
                {!data.charts.hasRevenue ? (
                    <EmptyChart message={NO_REVENUE} />
                ) : (
                    <BarsChart
                        data={revenueRows}
                        xKey="bucket"
                        series={[
                            { key: "revenue", label: "Faturamento", color: colorAt(0) },
                            { key: "target", label: "Meta mensal", color: colorAt(1) },
                        ]}
                        config={{ revenue: { label: "Faturamento", color: colorAt(0) }, target: { label: "Meta mensal", color: colorAt(1) } }}
                        ariaLabel="Faturamento bruto e meta mensal por mês"
                        xTickFormatter={xLabel}
                        valueFormatter={money}
                        table={{ columns: [{ key: "label", label: "Mês" }, { key: "revenue", label: `Faturamento (${data.currency})` }, { key: "target", label: `Meta (${data.currency})` }], rows: revenueRows }}
                    />
                )}
            </ChartCard>
            )}

            {data.visible.activities && (
            <ChartCard title="Valor por hora das atividades" description="As atividades ativas de maior valor">
                {!rateRows.length ? (
                    <EmptyChart message="Nenhuma atividade ativa." />
                ) : (
                    <RankedBarsCard
                        data={rateRows}
                        labelKey="name"
                        valueKey="rate"
                        config={{ rate: { label: "Valor por hora", color: colorAt(0) } }}
                        ariaLabel="Valor por hora das atividades"
                        valueFormatter={perHour}
                        table={{ columns: [{ key: "name", label: "Atividade" }, { key: "rate", label: `Valor por hora (${data.currency})` }], rows: rateRows }}
                    />
                )}
            </ChartCard>
            )}

            {data.visible.activities && (
            <ChartCard title="Evolução do valor por hora" description={`Pelo histórico de preços · por ${pointLabel.toLowerCase()}`}>
                {!trendSeries.length ? (
                    <EmptyChart message="Nenhuma atividade ativa." />
                ) : (
                    <TrendLineChart
                        data={trendRows}
                        xKey="bucket"
                        series={trendSeries}
                        config={Object.fromEntries(trendSeries.map((series) => [series.key, { label: series.label, color: series.color }]))}
                        ariaLabel="Evolução do valor por hora das atividades"
                        xTickFormatter={xLabel}
                        valueFormatter={perHour}
                        table={{ columns: [{ key: "label", label: pointLabel }, ...trendSeries.map((series) => ({ key: series.key, label: series.label }))], rows: trendRows }}
                    />
                )}
            </ChartCard>
            )}

            {data.visible.successes && (
            <ChartCard title="Sucessos no período" description={`Pela data do sucesso · por ${pointLabel.toLowerCase()}`}>
                {!successRows.some((row) => row.count > 0) ? (
                    <EmptyChart />
                ) : (
                    <BarsChart
                        data={successRows}
                        xKey="bucket"
                        series={[{ key: "count", label: "Sucessos", color: colorAt(0) }]}
                        config={{ count: { label: "Sucessos", color: colorAt(0) } }}
                        ariaLabel="Sucessos no período"
                        xTickFormatter={xLabel}
                        valueFormatter={formatCount}
                        table={{ columns: [{ key: "label", label: pointLabel }, { key: "count", label: "Sucessos" }], rows: successRows }}
                    />
                )}
            </ChartCard>
            )}

            {data.visible.activities && <CategoryDonut title="Atividades por categoria" description="Atividades ativas" slices={data.charts.activitiesByCategory} ariaLabel="Atividades por categoria" />}
            {data.visible.documents && <CategoryDonut title="Documentos por categoria" description="Documentos ativos" slices={data.charts.documentsByCategory} ariaLabel="Documentos por categoria" />}
        </div>
    )
}

/** Atalhos do espaço numa coluna à direita (no celular, depois do conteúdo). */
function Shortcuts({ businessId, counts }: { businessId: string; counts: BusinessDashboardDto["counts"] | null }) {
    const { can } = usePermissions()
    return (
        <nav aria-labelledby="dashboard-shortcuts" className="space-y-3 lg:sticky lg:top-0">
            <h2 id="dashboard-shortcuts" className="text-sm font-semibold text-foreground">
                Atalhos
            </h2>
            <ul className="space-y-2">
                {SHORTCUTS.filter((shortcut) => canSeeSpaceSection(shortcut.slug, can)).map((shortcut) => (
                    <li key={shortcut.slug}>
                        <Link href={businessSpaceHref(businessId, shortcut.slug)} scroll={false} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <Card className="flex items-center gap-3 p-3 transition-colors group-hover:border-primary/50">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                                    <shortcut.icon className="h-5 w-5" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{shortcut.label}</span>
                                    {shortcut.count && (
                                        <span className="block text-xs text-muted-foreground">
                                            {counts && shortcut.text ? (
                                                shortcut.text(counts[shortcut.count])
                                            ) : (
                                                <>
                                                    {counts ? <AnimatedNumber value={counts[shortcut.count]} /> : "—"} ativo(s)
                                                </>
                                            )}
                                        </span>
                                    )}
                                </span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                            </Card>
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    )
}

/**
 * Página inicial do espaço: período (mês atual, 3, 6 ou 12 meses, guardado no navegador), indicadores,
 * a meta atual (linha inteira) e gráficos na coluna principal; atalhos na coluna à direita. Trabalhos por coluna
 * entram com o M4.
 */
export function BusinessDashboardPage() {
    const { business } = useBusinessSpace()
    const { period, setPeriod, ready } = useBusinessDashboardPeriod()
    const query = useBusinessDashboard(business.id, period, ready)
    const data = query.data
    const view = !ready || query.isPending ? "loading" : query.isError || !data ? "error" : "ready"

    return (
        <>
            <DashboardHeader
                title={business.name}
                description={businessSubtitle(business)}
                leading={<BusinessAvatar business={business} className="h-10 w-10" />}
                period={period}
                onPeriodChange={setPeriod}
                periods={PERIOD_OPTIONS}
                onRefresh={() => void query.refetch()}
                refreshing={query.isFetching}
            />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="min-w-0 space-y-6">
                        {view === "loading" && (
                            <>
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-24" />)}</div>
                                <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((index) => <Skeleton key={index} className="h-72" />)}</div>
                            </>
                        )}
                        {view === "error" && <ErrorState title="Não foi possível carregar o dashboard" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                        {view === "ready" && data && (
                            <>
                                <DashboardKpis items={kpiItems(data)} className="xl:grid-cols-3" />
                                {data.visible.goals && (
                                <section aria-labelledby="dashboard-goal">
                                    <h2 id="dashboard-goal" className="sr-only">
                                        Meta atual
                                    </h2>
                                    {data.goal ? (
                                        <CurrentGoalHighlight
                                            goal={data.goal}
                                            currency={data.currency}
                                            timeZone={data.timeZone}
                                            actions={
                                                <Link href={businessSpaceHref(business.id, "metas")} scroll={false} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                                                    Ver metas <ArrowRight className="h-4 w-4" aria-hidden />
                                                </Link>
                                            }
                                        />
                                    ) : (
                                        <Card>
                                            <EmptyState icon={Target} title="Nenhuma meta ativa" description="Defina a meta de faturamento bruto por mês, ano ou hora.">
                                                <Link href={businessSpaceHref(business.id, "metas")} scroll={false} className="text-sm font-medium text-primary hover:underline">
                                                    Definir meta
                                                </Link>
                                            </EmptyState>
                                        </Card>
                                    )}
                                </section>
                                )}
                                <section className="space-y-3" aria-labelledby="dashboard-charts">
                                    <h2 id="dashboard-charts" className="text-sm font-semibold text-foreground">
                                        Gráficos
                                    </h2>
                                    <DashboardCharts data={data} />
                                </section>
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>
                <Shortcuts businessId={business.id} counts={data?.counts ?? null} />
            </div>
        </>
    )
}
