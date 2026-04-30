<script lang="ts">
    import { goto } from '$app/navigation';
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';
    import type { Event } from '$lib/types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // ── カレンダーロジック ────────────────────────────────────────

    const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
    const MONTH_NAMES = [
        '1月', '2月', '3月', '4月', '5月', '6月',
        '7月', '8月', '9月', '10月', '11月', '12月',
    ];

    /** 月のカレンダーグリッドを生成（null = 前月の空白） */
    function buildCalendarGrid(year: number, month: number): (number | null)[] {
        const firstDow = new Date(year, month - 1, 1).getDay(); // 0=日
        const startPad = (firstDow + 6) % 7; // 月曜始まり
        const daysInMonth = new Date(year, month, 0).getDate();
        const cells: (number | null)[] = Array(startPad).fill(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        return cells;
    }

    /** その日のイベント一覧 */
    function eventsOnDay(year: number, month: number, day: number): Event[] {
        return data.events.filter((e) => {
            const d = new Date(e.scheduled_at);
            return d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day;
        });
    }

    function isToday(year: number, month: number, day: number): boolean {
        const now = new Date();
        return now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;
    }

    function prevMonth() {
        let y = data.year, m = data.month - 1;
        if (m < 1) { m = 12; y--; }
        goto(`/calendar?year=${y}&month=${m}`);
    }

    function nextMonth() {
        let y = data.year, m = data.month + 1;
        if (m > 12) { m = 1; y++; }
        goto(`/calendar?year=${y}&month=${m}`);
    }

    function formatTime(iso: string): string {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    const grid = $derived(buildCalendarGrid(data.year, data.month));
</script>

<svelte:head>
    <title>カレンダー — Anipolis</title>
</svelte:head>

<div class="calendar-page-container">
    <!-- カレンダー本体 -->
    <div class="calendar-main">
        <div class="card calendar-card">
            <!-- ヘッダー：月ナビゲーション -->
            <div class="calendar-header">
                <button type="button" class="btn btn-ghost calendar-nav-btn" onclick={prevMonth} aria-label="前の月">
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>
                <h2 class="calendar-title">
                    {data.year}年 {MONTH_NAMES[data.month - 1]}
                </h2>
                <button type="button" class="btn btn-ghost calendar-nav-btn" onclick={nextMonth} aria-label="次の月">
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </button>
            </div>

            <!-- 曜日ヘッダー -->
            <div class="calendar-weekdays">
                {#each WEEKDAYS as day}
                    <div class="calendar-weekday">{day}</div>
                {/each}
            </div>

            <!-- 日グリッド -->
            <div class="calendar-grid">
                {#each grid as cell}
                    <div class="calendar-cell {cell ? '' : 'calendar-cell--empty'} {cell && isToday(data.year, data.month, cell) ? 'calendar-cell--today' : ''}">
                        {#if cell}
                            <span class="calendar-day-num">{cell}</span>
                            <div class="calendar-events">
                                {#each eventsOnDay(data.year, data.month, cell) as event}
                                    <a
                                        href="/events/{event.id}"
                                        class="calendar-event-chip {event.is_cancelled ? 'calendar-event-chip--cancelled' : ''}"
                                        title="{event.title} ({formatTime(event.scheduled_at)})"
                                    >
                                        <span class="calendar-event-time">{formatTime(event.scheduled_at)}</span>
                                        <span class="calendar-event-title">{event.title}</span>
                                    </a>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- イベント一覧（今月） -->
        {#if data.events.length > 0}
            <div class="card" style="margin-top: 16px;">
                <h3 class="section-heading">今月のイベント</h3>
                <div class="event-list">
                    {#each data.events as event}
                        <a href="/events/{event.id}" class="event-list-item {event.is_cancelled ? 'event-list-item--cancelled' : ''}">
                            <div class="event-list-meta">
                                <time class="event-list-date">
                                    {new Date(event.scheduled_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                                    {formatTime(event.scheduled_at)}
                                </time>
                                {#if event.is_cancelled}
                                    <span class="event-badge event-badge--cancelled">キャンセル</span>
                                {/if}
                            </div>
                            <div class="event-list-title">{event.title}</div>
                            <div class="event-list-hashtag">#{event.hashtag}</div>
                        </a>
                    {/each}
                </div>
            </div>
        {:else}
            <div class="card" style="margin-top:16px; text-align:center; color:var(--color-muted); padding:32px;">
                今月のイベントはありません
            </div>
        {/if}
    </div>

    <!-- サイドバー -->
    <aside class="calendar-sidebar">
        <div class="card">
            <h3 class="section-heading">イベントとは</h3>
            <p style="color:var(--color-muted); font-size:0.875rem; line-height:1.7;">
                Anipolisのスタッフがアニメの放送・配信に合わせて実況イベントを企画します。
            </p>
            <p style="color:var(--color-muted); font-size:0.875rem; line-height:1.7; margin-top:8px;">
                イベント当日にハッシュタグ投稿すると、みんなの実況が一か所に集まります。
            </p>
        </div>

        <!-- 検証用：即時開始イベント作成 -->
        {#if data.user}
            <div class="card" style="margin-top:16px; border: 1px dashed var(--color-border);">
                <h3 class="section-heading" style="font-size:0.8rem; color:var(--color-muted);">🧪 テスト用イベント作成</h3>
                {#if form && 'message' in form}
                    <p class="form-error">{form.message}</p>
                {/if}
                <form method="POST" action="?/createEvent" use:enhance>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                        <input
                            class="input"
                            type="text"
                            name="title"
                            placeholder="イベントタイトル"
                            required
                            maxlength="100"
                            style="font-size:0.875rem;"
                        />
                        <input
                            class="input"
                            type="text"
                            name="hashtag"
                            placeholder="ハッシュタグ（# 不要）"
                            required
                            maxlength="50"
                            style="font-size:0.875rem;"
                        />
                        <input
                            class="input"
                            type="number"
                            name="duration_minutes"
                            placeholder="配信時間（分、任意）"
                            min="1"
                            style="font-size:0.875rem;"
                        />
                        <button type="submit" class="btn btn-primary btn-sm">
                            今すぐ作成してルームへ入る
                        </button>
                    </div>
                    <p style="color:var(--color-muted); font-size:0.75rem; margin-top:6px;">
                        作成と同時にタイマーがスタートします
                    </p>
                </form>
            </div>
        {/if}
    </aside>
</div>
