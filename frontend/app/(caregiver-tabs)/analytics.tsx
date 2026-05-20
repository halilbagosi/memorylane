import { colors, lightColors, darkColors } from '../../src/theme/colors';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Alert, Animated, Platform, View, Text, StyleSheet, ScrollView, Pressable, LayoutAnimation, UIManager, TouchableOpacity, Modal, Linking, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DatePickerModal } from 'react-native-paper-dates';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { CaregiverAvatarButton } from '../../src/components/CaregiverAvatarButton';
import { AdaptiveCard } from '../../src/components/AdaptiveCard';
import { M3BottomSheet } from '../../src/components/M3BottomSheet';
import { API_BASE_URL } from '../../src/config/api';
import { clearAuth, getCaregiverInfo, getToken } from '../../src/utils/auth';

type FilterKey = 'day' | 'week' | 'month' | 'year' | 'custom';

type QuizReport = {
  id: string;
  mode: string;
  mediaPublicId: string;
  name: string;
  attempts: number;
  averagePercent: number;
  pointsEarned: number;
  pointsTotal: number;
  completed: number;
  averageTimeMs?: number;
  createdAt: string;
  questionOutcomes: QuestionOutcome[];
};

type QuestionOutcome = {
  id: string;
  prompt: string;
  status: 'Correct' | 'Wrong' | 'Skipped';
  attemptsUntilResult: number;
  duration: string;
  takenAt: string;
};

type QuizTypeReport = {
  id: string;
  mode: string;
  label: string;
  description: string;
  quizzes: QuizReport[];
};

type DateOption = {
  label: string;
  value: string;
};

type FilterOption = {
  key: FilterKey;
  label: string;
};

type PatientItem = {
  id: string;
  name: string;
  surname: string;
  isPrimary: boolean;
};

type ProgressResponse = {
  patientId: string;
  registeredAt: string;
  quizTypes: QuizTypeReport[];
};

type AppliedFilter = {
  filter: FilterKey;
  dateValue: string;
  customFrom: string;
  customTo: string;
};

type InsightPost = {
  id: string;
  slug: string;
  title: string;
  introduction: string;
  summary: string;
  articleUrl: string;
  publishedAt: string;
  readingMinutes: number;
  source: string;
  institution: string;
  tags: string[];
  saved?: boolean;
};

const FILTERS: FilterOption[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

const isIOS = Platform.OS === 'ios';
if (!isIOS && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const TODAY = new Date();
const DEFAULT_FILTER_START = new Date(2024, 0, 12);

const SEEDED_INSIGHT_POSTS: InsightPost[] = [
  {
    id: 'insight-tips-caregivers-2026',
    slug: 'practical-caregiving-tips-for-dementia',
    title: 'Practical Caregiving Tips for Dementia',
    introduction: 'A caregiver-focused guide to everyday support, communication, routines, safety, and self-care when caring for someone living with dementia.',
    summary: `This caregiver guide focuses on practical day-to-day support for people living with dementia, especially as memory, communication, judgment, and independence change over time.

It emphasizes creating predictable routines because consistency can reduce confusion and help daily tasks feel less overwhelming. Small adjustments, such as keeping familiar items visible and simplifying choices, can make care easier for both the person with dementia and the caregiver.

The article also highlights communication strategies. Speaking calmly, using simple wording, giving one instruction at a time, and allowing extra time can help reduce frustration during conversations or daily care.

Safety is another major theme. The guide encourages caregivers to think ahead about wandering, medication management, falls, kitchen safety, driving, and other risks that may grow as symptoms progress.

It also recognizes the emotional load of caregiving. Caregivers are encouraged to ask for help, take breaks, stay connected with others, and pay attention to their own physical and mental health.

Overall, the resource works like a practical checklist for home care. It is most useful for caregivers who need concrete tips they can apply immediately in everyday routines.`,
    articleUrl: 'https://www.alzheimers.gov/life-with-dementia/tips-caregivers',
    publishedAt: '2026-05-15T00:00:00.000Z',
    readingMinutes: 8,
    source: 'Alzheimers.gov caregiver guidance',
    institution: 'U.S. Department of Health and Human Services',
    tags: ['tips', 'caregiver wellbeing', 'specific symptoms', 'stage 1', 'stage 2', 'stage 3', 'resources'],
    saved: false,
  },
  {
    id: 'insight-nia-caregiver-advances-2022',
    slug: 'dementia-care-and-caregiver-research-advances',
    title: 'Dementia Care and Caregiver Research Advances',
    introduction: 'A research progress summary on dementia care models, caregiver support, and services intended to improve outcomes for people living with dementia and their families.',
    summary: `This research summary reviews scientific advances related to dementia care and caregiver support, with attention to how care systems can better serve people living with dementia and their families.

It frames caregiving as a major part of dementia treatment and quality of life, not just a private family responsibility. The article points to the need for supports that help caregivers manage symptoms, coordinate care, and reduce stress.

The summary also highlights research on care models and services. These efforts aim to improve communication between families and clinicians, make care planning more effective, and connect caregivers with resources earlier.

Caregiver wellbeing is a recurring theme. The article recognizes that caregiver burden can affect health, finances, work, and family life, which means caregiver support should be treated as part of dementia care.

The article also reflects a broader shift toward person-centered dementia care. Instead of focusing only on disease progression, care research increasingly considers daily function, safety, dignity, and quality of life.

For caregivers, the main takeaway is that support systems matter. Better training, better access to services, and better care coordination can make caregiving more sustainable.`,
    articleUrl: 'https://www.nia.nih.gov/2021-2022-alzheimers-disease-related-dementias-scientific-advances/dementia-care-and-caregiver',
    publishedAt: '2022-12-01T00:00:00.000Z',
    readingMinutes: 6,
    source: "2021-2022 Alzheimer's Disease and Related Dementias Scientific Advances",
    institution: 'National Institute on Aging',
    tags: ['research', 'caregiver wellbeing', 'study/treatment', 'resources', 'stage 2', 'stage 3'],
    saved: false,
  },
  {
    id: 'insight-latest-diagnosis-treatment-dementia-2023',
    slug: 'latest-advances-diagnosis-treatment-dementia',
    title: 'Latest Advances in the Diagnosis and Treatment of Dementia',
    introduction: 'A peer-reviewed overview of current dementia diagnosis and treatment approaches, including clinical evaluation, biomarkers, medication options, and emerging research directions.',
    summary: `This peer-reviewed article reviews current advances in dementia diagnosis and treatment, including the clinical tools and biological markers that can help clinicians better understand different forms of cognitive decline.

The article explains that dementia diagnosis is not based on one observation alone. It typically involves clinical history, cognitive testing, functional assessment, neurological evaluation, and, when appropriate, imaging or laboratory support.

Biomarkers and imaging are discussed as important areas of progress. These tools can help identify disease processes earlier and may improve the ability to distinguish Alzheimer’s disease from other causes of dementia.

Treatment is presented as both medical and supportive. Medication may help manage symptoms or target specific disease pathways, but care planning, safety, behavioral support, and caregiver education remain central.

The review also points toward emerging therapies and ongoing research. New treatments and trials continue to evolve, making it important for clinicians and families to stay informed about evidence, risks, and eligibility.

For caregivers, the article is useful because it shows why diagnosis and treatment decisions can be complex. It reinforces the need for individualized care, regular reassessment, and close communication with healthcare professionals.`,
    articleUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10787596/',
    publishedAt: '2023-12-01T00:00:00.000Z',
    readingMinutes: 12,
    source: 'Hafiz R. et al., The latest advances in the diagnosis and treatment of dementia',
    institution: 'National Library of Medicine / PubMed Central',
    tags: ['research', 'medication updates', 'study/treatment', 'trial', 'specific symptoms', 'stage 1', 'stage 2'],
    saved: false,
  },
];

function ordinal(day: number) {
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatLongDate(date: Date) {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

function formatShortDate(date: Date) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[date.getMonth()]} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

function formatExportTimestamp(date: Date) {
  return `${formatShortDate(date)} at ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromISODate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseFilterStartDate(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return startOfDay(DEFAULT_FILTER_START);
  const start = startOfDay(parsed);
  return start > TODAY ? startOfDay(TODAY) : start;
}

function getMonday(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - diff);
  return next;
}

function getISOWeekParts(date: Date) {
  const target = startOfDay(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const year = target.getFullYear();
  const weekOne = new Date(target.getFullYear(), 0, 4);
  const week = 1 + Math.round(((target.getTime() - weekOne.getTime()) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7);
  return { year, week };
}

function weekValue(date: Date) {
  const { year, week } = getISOWeekParts(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function parseWeekValue(value: string) {
  const match = value.match(/^(\d{4})-W(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const fourth = new Date(year, 0, 4);
  const firstMonday = getMonday(fourth);
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getFilterScopeLabel(
  filter: FilterKey,
  dateValue: string,
  customFrom: string,
  customTo: string,
  dateOptions: Record<Exclude<FilterKey, 'custom'>, DateOption[]>
) {
  if (filter === 'custom') {
    return `${formatShortDate(fromISODate(customFrom))} - ${formatShortDate(fromISODate(customTo))}`;
  }

  if (filter === 'day') {
    return formatLongDate(fromISODate(dateValue));
  }

  const option = dateOptions[filter].find((item) => item.value === dateValue) ?? dateOptions[filter][0];
  return option?.label ?? '';
}

function buildDayOptions(end: Date): DateOption[] {
  return [
    { label: formatLongDate(end), value: toISODate(end) },
  ];
}

function buildWeekOptions(start: Date, end: Date): DateOption[] {
  const options: DateOption[] = [];
  const first = getMonday(start);
  const cursor = getMonday(end);

  while (cursor >= first) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const labelStart = weekStart < start ? start : weekStart;
    const labelEnd = weekEnd > end ? end : weekEnd;
    options.push({
      label: `${formatShortDate(labelStart)} - ${formatShortDate(labelEnd)}`,
      value: weekValue(weekStart),
    });
    cursor.setDate(cursor.getDate() - 7);
  }

  return options;
}

function buildMonthOptions(start: Date, end: Date): DateOption[] {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const options: DateOption[] = [];
  const cursor = new Date(end.getFullYear(), end.getMonth(), 1);
  const first = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor >= first) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    options.push({
      label: `${months[month]} ${year}`,
      value: `${year}-${String(month + 1).padStart(2, '0')}`,
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return options;
}

function buildYearOptions(start: Date, end: Date): DateOption[] {
  const options: DateOption[] = [];
  for (let year = end.getFullYear(); year >= start.getFullYear(); year -= 1) {
    options.push({ label: String(year), value: String(year) });
  }
  return options;
}

function buildDateOptions(start: Date, end: Date): Record<Exclude<FilterKey, 'custom'>, DateOption[]> {
  return {
    day: buildDayOptions(end),
    week: buildWeekOptions(start, end),
    month: buildMonthOptions(start, end),
    year: buildYearOptions(start, end),
  };
}

const DEFAULT_DATE_OPTIONS = buildDateOptions(DEFAULT_FILTER_START, TODAY);
const DEFAULT_CUSTOM_FROM = toISODate(DEFAULT_FILTER_START);
const DEFAULT_CUSTOM_TO = toISODate(TODAY);

function summarize(quizzes: QuizReport[]) {
  const attempts = quizzes.reduce((sum, quiz) => sum + quiz.attempts, 0);
  const completed = quizzes.reduce((sum, quiz) => sum + quiz.completed, 0);
  const pointsEarned = quizzes.reduce((sum, quiz) => sum + quiz.pointsEarned, 0);
  const pointsTotal = quizzes.reduce((sum, quiz) => sum + quiz.pointsTotal, 0);
  const averagePercent = pointsTotal > 0 ? Math.round((pointsEarned / pointsTotal) * 100) : 0;

  return { attempts, completed, pointsEarned, pointsTotal, averagePercent };
}

function thresholdStage(percent: number) {
  if (percent < 20) return 1;
  if (percent < 40) return 2;
  if (percent < 60) return 3;
  if (percent < 80) return 4;
  return 5;
}

function formatTakenAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatExportTimestamp(date);
}

function clampRangeToStart(range: { start: Date; end: Date }, minStart: Date) {
  return {
    start: range.start < minStart ? new Date(minStart) : range.start,
    end: range.end,
  };
}

function dateRangeForFilter(filter: AppliedFilter | null, minStart: Date): { start: Date; end: Date } | null {
  if (!filter) return null;

  if (filter.filter === 'day') {
    const start = fromISODate(filter.dateValue);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return clampRangeToStart({ start, end }, minStart);
  }

  if (filter.filter === 'month') {
    const [year, month] = filter.dateValue.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return clampRangeToStart({ start, end }, minStart);
  }

  if (filter.filter === 'year') {
    const year = Number(filter.dateValue);
    return clampRangeToStart({
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    }, minStart);
  }

  if (filter.filter === 'custom') {
    const start = fromISODate(filter.customFrom);
    const end = fromISODate(filter.customTo);
    end.setHours(23, 59, 59, 999);
    return clampRangeToStart({ start, end }, minStart);
  }

  const parsedWeek = parseWeekValue(filter.dateValue);
  if (parsedWeek) {
    return clampRangeToStart(parsedWeek, minStart);
  }

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return clampRangeToStart({ start, end }, minStart);
}

function applyTimeFilterToQuiz(quiz: QuizReport, filter: AppliedFilter | null, minStart: Date): QuizReport {
  const range = dateRangeForFilter(filter, minStart);
  if (!range) return quiz;

  const questionOutcomes = quiz.questionOutcomes.filter((outcome) => {
    const date = new Date(outcome.takenAt);
    if (Number.isNaN(date.getTime())) return false;
    return date >= range.start && date <= range.end;
  });
  const pointsEarned = questionOutcomes.filter((outcome) => outcome.status === 'Correct').length;
  const pointsTotal = questionOutcomes.length;

  return {
    ...quiz,
    attempts: pointsTotal,
    completed: pointsTotal,
    pointsEarned,
    pointsTotal,
    averagePercent: pointsTotal > 0 ? Math.round((pointsEarned / pointsTotal) * 100) : 0,
    questionOutcomes,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function chunkRows(rows: string[], size: number) {
  const chunks: string[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function buildPdfHtml({
  title,
  eyebrow,
  filterLabel,
  summary,
  quizzes,
  selectedQuiz,
  patientName,
  caregiverName,
  exportedAt,
}: {
  title: string;
  eyebrow: string;
  filterLabel: string;
  summary: ReturnType<typeof summarize>;
  quizzes: QuizReport[];
  selectedQuiz: QuizReport | null;
  patientName: string;
  caregiverName: string;
  exportedAt: string;
}) {
  const tableHeader = selectedQuiz
    ? '<tr><th>Question</th><th>Result</th><th>Tries</th><th>Time</th><th>Taken</th></tr>'
    : '<tr><th>Quiz</th><th>Score</th><th>Points</th><th>Threshold</th><th>Completed/Attempts</th></tr>';
  const rowItems: string[] = selectedQuiz
    ? selectedQuiz.questionOutcomes.map((outcome) => `
      <tr>
        <td>${escapeHtml(outcome.prompt)}</td>
        <td>${escapeHtml(outcome.status)}</td>
        <td>${outcome.attemptsUntilResult}</td>
        <td>${escapeHtml(outcome.duration)}</td>
        <td>${escapeHtml(formatTakenAt(outcome.takenAt))}</td>
      </tr>
    `)
    : quizzes.map((quiz) => `
      <tr>
        <td>${escapeHtml(quiz.name)}</td>
        <td>${quiz.averagePercent}%</td>
        <td>${quiz.pointsEarned}/${quiz.pointsTotal}</td>
        <td>${thresholdStage(quiz.averagePercent)}/5</td>
        <td>${quiz.completed}/${quiz.attempts}</td>
      </tr>
    `);
  const firstPageRowCount = selectedQuiz ? 8 : 6;
  const continuationRowCount = selectedQuiz ? 10 : 12;
  const tableChunks = rowItems.length <= firstPageRowCount
    ? [rowItems]
    : [
        rowItems.slice(0, firstPageRowCount),
        ...chunkRows(rowItems.slice(firstPageRowCount), continuationRowCount),
      ];
  const chartRows = quizzes.map((quiz) => `
    <div class="bar-row">
      <div class="bar-name">${escapeHtml(quiz.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${quiz.averagePercent}%"></div></div>
      <div class="bar-value">${quiz.averagePercent}%</div>
    </div>
  `).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #1A1A1A; padding: 0; }
          .pdf-page { padding: 28px; }
          .pdf-page.page-break { page-break-after: always; break-after: page; }
          .continued-page { padding-top: 42px; }
          .continued-title { color: #666; font-size: 12px; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; }
          .eyebrow { color: #03573a; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          .metadata { margin-bottom: 22px; }
          .scope { color: #666; font-size: 13px; margin: 0 0 4px; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
          .metric { border: 1px solid #dfe7e2; border-radius: 8px; padding: 12px; background: #f7fbf8; }
          .metric-label { color: #666; font-size: 11px; font-weight: 600; margin-bottom: 5px; }
          .metric-value { font-size: 20px; font-weight: 800; }
          h2 { font-size: 17px; margin: 24px 0 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          @media print {
            .pdf-page.page-break { page-break-after: always; break-after: page; }
            .continued-page { padding-top: 42px; }
            tr { break-inside: avoid; page-break-inside: avoid; }
          }
          th { text-align: left; background: #E8F5EC; padding: 9px; }
          td { border-bottom: 1px solid #e3e8e5; padding: 9px; vertical-align: top; }
          .bar-row { display: grid; grid-template-columns: 170px 1fr 44px; align-items: center; gap: 10px; margin: 8px 0; font-size: 12px; }
          .bar-track { height: 10px; border-radius: 5px; background: rgba(3, 87, 58, 0.12); overflow: hidden; }
          .bar-fill { height: 10px; border-radius: 5px; background: #03573a; }
          .bar-value { text-align: right; font-weight: 700; }
          .note { color: #666; font-size: 11px; margin-top: 18px; }
        </style>
      </head>
      <body>
        <section class="pdf-page ${tableChunks.length > 1 ? 'page-break' : ''}">
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
          <h1>${escapeHtml(title)}</h1>
          <div class="metadata">
            <div class="scope">Patient: ${escapeHtml(patientName)}</div>
            <div class="scope">Exported by: ${escapeHtml(caregiverName)}</div>
            <div class="scope">Exported at: ${escapeHtml(exportedAt)}</div>
            <div class="scope">Filtered by ${escapeHtml(filterLabel)}</div>
          </div>

          <div class="metrics">
            <div class="metric"><div class="metric-label">Score</div><div class="metric-value">${summary.averagePercent}%</div></div>
            <div class="metric"><div class="metric-label">Points</div><div class="metric-value">${summary.pointsEarned}/${summary.pointsTotal}</div></div>
            <div class="metric"><div class="metric-label">Threshold</div><div class="metric-value">${thresholdStage(summary.averagePercent)}/5</div></div>
            <div class="metric"><div class="metric-label">Attempts</div><div class="metric-value">${summary.completed}/${summary.attempts}</div></div>
          </div>

          ${selectedQuiz ? '' : `<h2>Score comparison</h2>${chartRows}`}

          <h2>${selectedQuiz ? 'Question feedback' : 'Quiz report'}</h2>
          <table>
            <thead>${tableHeader}</thead>
            <tbody>${tableChunks[0]?.join('') ?? ''}</tbody>
          </table>
        </section>
        ${tableChunks.slice(1).map((chunk, index) => `
          <section class="pdf-page continued-page ${index < tableChunks.slice(1).length - 1 ? 'page-break' : ''}">
            <div class="continued-title">${selectedQuiz ? 'Question feedback' : 'Quiz report'} continued</div>
            <table>
              <thead>${tableHeader}</thead>
              <tbody>${chunk.join('')}</tbody>
            </table>
          </section>
        `).join('')}
        <div class="note">MemoryLane progress report generated from recorded quiz answers.</div>
      </body>
    </html>
  `;
}

function formatInsightDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatReadingTime(minutes: number) {
  if (minutes < 60) return `${minutes} min read`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr read` : `${hours} hr ${rest} min read`;
}

function isNewInsight(post: InsightPost) {
  const publishedAt = new Date(post.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const ageMs = TODAY.getTime() - publishedAt.getTime();
  return ageMs >= 0 && ageMs <= sevenDaysMs;
}

function sortInsightsByPublishedDate(posts: InsightPost[]) {
  return [...posts].sort((a, b) => {
    const bTime = new Date(b.publishedAt).getTime();
    const aTime = new Date(a.publishedAt).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

function buildInsightPdfHtml(post: InsightPost) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #1A1A1A; padding: 32px; }
          h1 { font-size: 28px; margin: 0 0 12px; }
          .meta { color: #666; font-size: 13px; margin-bottom: 18px; }
          h2 { font-size: 17px; margin: 22px 0 8px; }
          p { font-size: 14px; line-height: 1.5; }
          .tags { margin-top: 18px; }
          .tag { display: inline-block; border: 1px solid #dfe7e2; border-radius: 12px; padding: 5px 9px; margin: 3px; font-size: 11px; }
          a { color: #03573a; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="meta">${escapeHtml(formatInsightDate(post.publishedAt))} · ${escapeHtml(formatReadingTime(post.readingMinutes))}</div>
        <div class="tags">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
        <h2>Introduction</h2>
        <p>${escapeHtml(post.introduction)}</p>
        <h2>Summary</h2>
        <p>${escapeHtml(post.summary)}</p>
        <h2>Full article</h2>
        <p><a href="${escapeHtml(post.articleUrl)}">${escapeHtml(post.articleUrl)}</a></p>
        <h2>Resources / Sources / Institution</h2>
        <p>${escapeHtml(post.source)}<br />${escapeHtml(post.institution)}</p>
      </body>
    </html>
  `;
}

function keepDateValueInOptions(filter: FilterKey, dateValue: string, dateOptions: Record<Exclude<FilterKey, 'custom'>, DateOption[]>) {
  if (filter === 'custom') return dateValue;
  const options = dateOptions[filter];
  return options.some((option) => option.value === dateValue) ? dateValue : options[0]?.value ?? dateValue;
}

function clampISODate(value: string, min: string, max: string) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export default function AnalyticsTab() {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const router = useRouter();
  const [draftFilter, setDraftFilter] = useState<FilterKey>('day');
  const [draftDateValue, setDraftDateValue] = useState(DEFAULT_DATE_OPTIONS.day[0].value);
  const [draftCustomFrom, setDraftCustomFrom] = useState(DEFAULT_CUSTOM_FROM);
  const [draftCustomTo, setDraftCustomTo] = useState(DEFAULT_CUSTOM_TO);
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter | null>(null);
  const [patientFilterStart, setPatientFilterStart] = useState(() => startOfDay(DEFAULT_FILTER_START));
  const [filterOpen, setFilterOpen] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'day' | 'from' | 'to' | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [patientOptions, setPatientOptions] = useState<DateOption[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(false);
  const [quizTypes, setQuizTypes] = useState<QuizTypeReport[]>([]);
  const [caregiverName, setCaregiverName] = useState('Caregiver');
  const [exporting, setExporting] = useState(false);
  const [insightPosts, setInsightPosts] = useState<InsightPost[]>(sortInsightsByPublishedDate(SEEDED_INSIGHT_POSTS));
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const [savedInsightsVisible, setSavedInsightsVisible] = useState(false);
  const filterDateOptions = useMemo(
    () => buildDateOptions(patientFilterStart, TODAY),
    [patientFilterStart]
  );

  const animate = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const allQuizzes = useMemo(
    () => quizTypes.flatMap((type) => type.quizzes),
    [quizTypes]
  );
  const selectedType = quizTypes.find((type) => type.id === selectedTypeId) ?? null;
  const isOverallSelected = selectedTypeId === 'overall';
  const detailQuizzes = isOverallSelected ? allQuizzes : selectedType?.quizzes ?? [];
  const visibleDetailQuizzes = useMemo(
    () => detailQuizzes.map((quiz) => applyTimeFilterToQuiz(quiz, appliedFilter, patientFilterStart)),
    [detailQuizzes, appliedFilter, patientFilterStart]
  );
  const detailSummary = summarize(visibleDetailQuizzes);
  const detailTitle = isOverallSelected ? 'All quiz types' : selectedType?.description ?? '';
  const detailEyebrow = isOverallSelected ? 'Overall' : `${selectedType?.label} overall`;
  const draftDateOptions = draftFilter === 'custom' ? [] : filterDateOptions[draftFilter];
  const draftDate = draftDateOptions.find((option) => option.value === draftDateValue) ?? draftDateOptions[0];
  const draftDateLabel = getFilterScopeLabel(draftFilter, draftDateValue, draftCustomFrom, draftCustomTo, filterDateOptions);
  const selectedQuiz = visibleDetailQuizzes.find((quiz) => quiz.id === selectedQuizId) ?? null;
  const selectedQuizSummary = selectedQuiz ? summarize([selectedQuiz]) : null;
  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );
  const selectedInsight = useMemo(
    () => insightPosts.find((post) => post.id === selectedInsightId) ?? null,
    [insightPosts, selectedInsightId]
  );
  const savedInsights = useMemo(
    () => insightPosts.filter((post) => post.saved),
    [insightPosts]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchPatients = async () => {
      try {
        const token = await getToken();
        const caregiver = await getCaregiverInfo();
        if (caregiver && !cancelled) {
          setCaregiverName(`${caregiver.name} ${caregiver.surname}`.trim());
        }

        if (!token) {
          router.replace('/login');
          return;
        }

        const res = await fetch(`${API_BASE_URL}/patients/my-list`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          await clearAuth();
          router.replace('/login');
          return;
        }

        if (!res.ok) {
          throw new Error('Could not load patients.');
        }

        const data = await res.json();
        const list: PatientItem[] = Array.isArray(data) ? data : (data.patients || []);
        const options = list.map((patient) => ({
          label: `${patient.name} ${patient.surname}`,
          value: patient.id,
        }));

        if (!cancelled) {
          setPatients(list);
          setPatientOptions(options);
          setSelectedPatientId((current) => current ?? options[0]?.value ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          Alert.alert('Patients unavailable', error instanceof Error ? error.message : 'Could not load patients.');
        }
      } finally {
        if (!cancelled) setPatientsLoading(false);
      }
    };

    fetchPatients();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const fetchInsights = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/insights`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setInsightPosts(sortInsightsByPublishedDate(data));
        }
      } catch {
        if (!cancelled) setInsightPosts(sortInsightsByPublishedDate(SEEDED_INSIGHT_POSTS));
      }
    };

    fetchInsights();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchProgress = async () => {
      if (!selectedPatientId) {
        setQuizTypes([]);
        setPatientFilterStart(startOfDay(DEFAULT_FILTER_START));
        return;
      }

      try {
        setProgressLoading(true);
        const token = await getToken();
        if (!token) {
          router.replace('/login');
          return;
        }

        const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(selectedPatientId)}/progress`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          await clearAuth();
          router.replace('/login');
          return;
        }

        if (res.status === 404) {
          if (!cancelled) {
            setQuizTypes([]);
            setSelectedTypeId(null);
            setSelectedQuizId(null);
          }
          return;
        }

        if (!res.ok) throw new Error('Could not load quiz progress.');

        const data = await res.json() as ProgressResponse;
        if (!cancelled) {
          setPatientFilterStart(parseFilterStartDate(data.registeredAt));
          setQuizTypes(data.quizTypes ?? []);
          setSelectedTypeId(null);
          setSelectedQuizId(null);
        }
      } catch (error) {
        if (!cancelled) {
          setQuizTypes([]);
        }
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    };

    fetchProgress();

    return () => {
      cancelled = true;
    };
  }, [router, selectedPatientId]);

  useEffect(() => {
    const minDate = toISODate(patientFilterStart);
    const maxDate = toISODate(TODAY);

    setDraftDateValue((current) => keepDateValueInOptions(draftFilter, current, filterDateOptions));
    setDraftCustomFrom((current) => clampISODate(current, minDate, maxDate));
    setDraftCustomTo((current) => clampISODate(current, minDate, maxDate));
    setAppliedFilter((current) => {
      if (!current) return current;

      const nextFrom = clampISODate(current.customFrom, minDate, maxDate);
      const nextTo = clampISODate(current.customTo, minDate, maxDate);
      const nextDateValue = keepDateValueInOptions(current.filter, current.dateValue, filterDateOptions);
      if (nextFrom === current.customFrom && nextTo === current.customTo && nextDateValue === current.dateValue) {
        return current;
      }

      return {
        ...current,
        customFrom: nextFrom,
        customTo: nextTo,
        dateValue: nextDateValue,
      };
    });
  }, [draftFilter, filterDateOptions, patientFilterStart]);

  const selectPatient = (patientId: string) => {
    animate();
    setSelectedPatientId(patientId);
    setIsPatientDropdownOpen(false);
    setSelectedTypeId(null);
    setSelectedQuizId(null);
    setFilterOpen(false);
  };

  const handleFilterChange = (filter: FilterKey) => {
    setDraftFilter(filter);
    if (filter !== 'custom') {
      setDraftDateValue(filterDateOptions[filter][0]?.value ?? toISODate(TODAY));
    }
  };
  const activeFilterLabel = appliedFilter
    ? `${FILTERS.find((filter) => filter.key === appliedFilter.filter)?.label ?? 'Day'}: ${getFilterScopeLabel(appliedFilter.filter, appliedFilter.dateValue, appliedFilter.customFrom, appliedFilter.customTo, filterDateOptions)}`
    : null;
  const openFilter = () => {
    if (appliedFilter) {
      setDraftFilter(appliedFilter.filter);
      setDraftDateValue(appliedFilter.dateValue);
      setDraftCustomFrom(appliedFilter.customFrom);
      setDraftCustomTo(appliedFilter.customTo);
    }
    setFilterOpen(true);
  };
  const clearFilter = () => {
    setAppliedFilter(null);
    setDraftFilter('day');
    setDraftDateValue(filterDateOptions.day[0]?.value ?? toISODate(TODAY));
    setDraftCustomFrom(toISODate(patientFilterStart));
    setDraftCustomTo(DEFAULT_CUSTOM_TO);
    setFilterOpen(false);
    setDatePickerTarget(null);
  };
  const exportReport = async () => {
    if (exporting) return;

    try {
      setExporting(true);
      const title = selectedQuiz ? selectedQuiz.name : detailTitle;
      const summary = selectedQuizSummary ?? detailSummary;
      const exportedAt = formatExportTimestamp(new Date());
      const pdf = await Print.printToFileAsync({
        html: buildPdfHtml({
          title,
          eyebrow: selectedQuiz ? 'Individual quiz' : detailEyebrow,
          filterLabel: activeFilterLabel ?? 'No time filter',
          summary,
          quizzes: selectedQuiz ? [selectedQuiz] : visibleDetailQuizzes,
          selectedQuiz,
          patientName: selectedPatient ? `${selectedPatient.name} ${selectedPatient.surname}` : 'No patient selected',
          caregiverName,
          exportedAt,
        }),
        base64: false,
      });

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert('PDF created', `The report was created at ${pdf.uri}`);
        return;
      }

      await Sharing.shareAsync(pdf.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Share progress report',
      });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not create the PDF report.');
    } finally {
      setExporting(false);
    }
  };

  const toggleInsightSave = async (post: InsightPost) => {
    const nextSaved = !post.saved;
    setInsightPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved: nextSaved } : item));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`${API_BASE_URL}/insights/${encodeURIComponent(post.id)}/save`, {
        method: nextSaved ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setInsightPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved: post.saved } : item));
    }
  };

  const exportInsightPost = async (post: InsightPost) => {
    try {
      const pdf = await Print.printToFileAsync({
        html: buildInsightPdfHtml(post),
        base64: false,
      });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert('PDF created', `The insight was created at ${pdf.uri}`);
        return;
      }
      await Sharing.shareAsync(pdf.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Share insight post',
      });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not create the PDF.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Progress</Text>
          <Text style={styles.headerSubtitle}>Quiz reports from recorded answers</Text>
        </View>
        <CaregiverAvatarButton />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {selectedTypeId ? (
          <>
            <Pressable
              style={styles.backButton}
              onPress={() => {
                if (selectedQuizId) {
                  setSelectedQuizId(null);
                } else {
                  setSelectedTypeId(null);
                  setFilterOpen(false);
                }
              }}
            >
              <AppIcon iosName="chevron.left" androidFallback="<" size={18} color={themeColors.secondary} />
              <Text style={styles.backButtonText}>{selectedQuizId ? detailTitle : 'All quiz types'}</Text>
            </Pressable>

            <ActionRow
              onOpenFilter={openFilter}
              activeFilterLabel={activeFilterLabel}
              onClearFilter={clearFilter}
              onExport={exportReport}
              exporting={exporting}
            />

            {selectedQuiz ? (
              <>
                <ReportPanel
                  eyebrow="Individual quiz"
                  title={selectedQuiz.name}
                  summary={selectedQuizSummary!}
                  quizCount={1}
                />
                <QuizAttemptDetails quiz={selectedQuiz} />
              </>
            ) : (
              <>
                <ReportPanel
                  eyebrow={detailEyebrow}
                  title={detailTitle}
                  summary={detailSummary}
                  quizCount={visibleDetailQuizzes.length}
                />

                <ReportCharts quizzes={visibleDetailQuizzes} selectedFilter={appliedFilter?.filter ?? 'year'} />

                <Text style={styles.sectionTitle}>Individual quizzes</Text>
                {visibleDetailQuizzes.length > 0 ? (
                  visibleDetailQuizzes.map((quiz) => (
                    <QuizRow key={quiz.id} quiz={quiz} onPress={() => setSelectedQuizId(quiz.id)} />
                  ))
                ) : (
                  <Text style={styles.emptyText}>No quiz answers found for this selection.</Text>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <AdaptiveCard style={styles.patientPanel}>
              <SectionHeader
                icon="person.fill"
                fallback="P"
                title="Patient"
                helper="Choose whose progress to review"
              />
              {patientsLoading ? (
                <Text style={styles.emptyText}>Loading patients...</Text>
              ) : patientOptions.length > 0 ? (
                <View style={styles.dropdownContainer}>
                  <TouchableOpacity
                    style={[styles.patientSelector, isPatientDropdownOpen && styles.patientSelectorOpen]}
                    onPress={() => {
                      animate();
                      setIsPatientDropdownOpen(!isPatientDropdownOpen);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.patientSelectorLeft}>
                      <View style={styles.patientInitialCircle}>
                        <Text style={styles.patientInitialText}>
                          {selectedPatient?.name?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.patientSelectorName}>
                          {selectedPatient ? `${selectedPatient.name} ${selectedPatient.surname}` : 'Choose patient'}
                        </Text>
                        {selectedPatient && (
                          <Text style={styles.patientSelectorRole}>
                            {selectedPatient.isPrimary ? 'Primary caregiver' : 'Supporting caregiver'}
                          </Text>
                        )}
                      </View>
                    </View>
                    <AppIcon
                      iosName={isPatientDropdownOpen ? 'chevron.up' : 'chevron.down'}
                      androidFallback={isPatientDropdownOpen ? '↑' : '↓'}
                      size={14}
                      color={themeColors.textMuted}
                    />
                  </TouchableOpacity>

                  {/* Animated Expanding List */}
                  {isPatientDropdownOpen && (
                    <View style={styles.dropdownList}>
                      {patients.map((patient) => (
                        <TouchableOpacity
                          key={patient.id}
                          style={styles.dropdownItem}
                          onPress={() => selectPatient(patient.id)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.patientInitialCircleSmall}>
                            <Text style={styles.patientInitialTextSmall}>
                              {patient.name[0]?.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.dropdownItemText}>
                            {patient.name} {patient.surname}
                          </Text>
                          {selectedPatientId === patient.id && (
                            <AppIcon iosName="checkmark" androidFallback="✓" size={14} color={themeColors.secondary} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <Text style={styles.emptyText}>No patients found for this caregiver account.</Text>
              )}
            </AdaptiveCard>

            <SectionHeader
              icon="chart.bar.fill"
              fallback="Q"
              title="Quiz types"
              helper="Open a type to view reports"
            />
            {progressLoading ? (
              <Text style={styles.emptyText}>Loading quiz progress...</Text>
            ) : (
              <>
                <TypeRow
                  label="Overall"
                  description="All active quiz types"
                  quizCount={allQuizzes.length}
                  onPress={() => setSelectedTypeId('overall')}
                />
                {quizTypes.map((type) => (
                  <TypeRow
                    key={type.id}
                    label={type.label}
                    description={type.description}
                    quizCount={type.quizzes.length}
                    onPress={() => setSelectedTypeId(type.id)}
                  />
                ))}
              </>
            )}
            {!progressLoading && quizTypes.length === 0 && (
              <Text style={styles.emptyText}>
                No quiz types are active for this patient yet. Create a quiz configuration and add quiz media first.
              </Text>
            )}
            <View style={styles.insightsDivider} />
            <View style={styles.insightsTitleRow}>
              <Text style={styles.insightsTitle}>Insights</Text>
              <Pressable
                style={styles.bookmarkButton}
                onPress={() => setSavedInsightsVisible(true)}
              >
                <AppIcon iosName="bookmark.fill" androidFallback="B" size={18} color={themeColors.secondary} />
              </Pressable>
            </View>
            {insightPosts.map((post) => (
              <InsightRow
                key={post.id}
                post={post}
                onPress={() => setSelectedInsightId(post.id)}
              />
            ))}
          </>
        )}
      </ScrollView>

      <InsightDetailModal
        post={selectedInsight}
        onClose={() => setSelectedInsightId(null)}
        onBackToProgress={() => setSelectedInsightId(null)}
        onOpenLink={(url) => Linking.openURL(url)}
        onExport={exportInsightPost}
        onToggleSave={toggleInsightSave}
      />

      <SavedInsightsModal
        visible={savedInsightsVisible}
        posts={savedInsights}
        onClose={() => setSavedInsightsVisible(false)}
        onOpenPost={(post) => {
          setSavedInsightsVisible(false);
          setSelectedInsightId(post.id);
        }}
      />

      <FilterModal
        visible={filterOpen}
        selectedFilter={draftFilter}
        selectedDate={draftDate}
        selectedDateOptions={draftDateOptions}
        selectedDateLabel={draftDateLabel}
        customFromValue={draftCustomFrom}
        customToValue={draftCustomTo}
        onFilterChange={handleFilterChange}
        onDateValueChange={setDraftDateValue}
        onOpenCalendar={setDatePickerTarget}
        onApply={() => {
          const minDate = toISODate(patientFilterStart);
          const maxDate = toISODate(TODAY);
          const nextCustomFrom = clampISODate(draftCustomFrom, minDate, maxDate);
          const nextCustomTo = clampISODate(draftCustomTo, nextCustomFrom, maxDate);
          setAppliedFilter({
            filter: draftFilter,
            dateValue: keepDateValueInOptions(draftFilter, draftDateValue, filterDateOptions),
            customFrom: nextCustomFrom,
            customTo: nextCustomTo,
          });
          setFilterOpen(false);
        }}
        onClose={() => setFilterOpen(false)}
      />

      <DatePickerModal
        locale="en"
        mode="single"
        visible={datePickerTarget != null}
        onDismiss={() => setDatePickerTarget(null)}
        date={datePickerTarget === 'from' ? fromISODate(draftCustomFrom) : datePickerTarget === 'to' ? fromISODate(draftCustomTo) : fromISODate(draftDateValue)}
        onConfirm={({ date }: { date: Date | undefined }) => {
          setDatePickerTarget(null);
          if (!date) return;
          const iso = clampISODate(toISODate(date), toISODate(patientFilterStart), toISODate(TODAY));
          if (datePickerTarget === 'from') {
            setDraftCustomFrom(iso);
            if (draftCustomTo < iso) setDraftCustomTo(iso);
          } else if (datePickerTarget === 'to') {
            setDraftCustomTo(iso);
          } else {
            setDraftDateValue(iso);
          }
        }}
        validRange={{ startDate: patientFilterStart, endDate: TODAY }}
        label="Select date"
        saveLabel="OK"
      />
    </SafeAreaView>
  );
}

function SelectDropdown({
  value,
  label,
  options,
  onSelect,
  disabled = false,
  icon,
}: {
  value: string;
  label: string;
  options: DateOption[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  icon?: 'calendar';
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.selectWrap, open && styles.selectWrapOpen]}>
      <Pressable
        style={[styles.selectButton, disabled && styles.selectDisabled]}
        onPress={() => {
          if (!disabled) setOpen((current) => !current);
        }}
      >
        {icon === 'calendar' && (
          <AppIcon iosName="calendar" androidFallback="C" size={16} color={themeColors.secondary} />
        )}
        <Text style={[styles.selectText, disabled && styles.selectTextDisabled]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.selectChevron}>v</Text>
      </Pressable>

      {open && !disabled && (
        <View style={styles.selectMenu}>
          <ScrollView nestedScrollEnabled style={styles.selectMenuScroll}>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.selectOption, active && styles.selectOptionActive]}
                  onPress={() => {
                    onSelect(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function CalendarField({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  return (
    <View style={styles.selectWrap}>
      <Pressable style={styles.selectButton} onPress={onPress}>
        <AppIcon iosName="calendar" androidFallback="C" size={16} color={themeColors.secondary} />
        <Text style={styles.selectText} numberOfLines={1}>{label}</Text>
        <Text style={styles.selectChevron}>v</Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({
  icon,
  fallback,
  title,
  helper,
}: {
  icon: any;
  fallback: string;
  title: string;
  helper?: string;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <AppIcon iosName={icon} androidFallback={fallback} size={16} color={themeColors.primary} />
      </View>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {helper && <Text style={styles.helperTextInline}>{helper}</Text>}
      </View>
    </View>
  );
}

function ActionRow({
  onOpenFilter,
  activeFilterLabel,
  onClearFilter,
  onExport,
  exporting,
}: {
  onOpenFilter: () => void;
  activeFilterLabel: string | null;
  onClearFilter: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  return (
    <View style={styles.actionRow}>
      <Pressable
        style={[styles.actionButton, styles.progressActionButton, styles.filterActionButton, activeFilterLabel && styles.filterActionButtonActive]}
        onPress={onOpenFilter}
      >
        <AppIcon iosName="calendar" androidFallback="C" size={16} color={themeColors.primary} />
        <Text style={styles.actionButtonText} numberOfLines={1}>
          {activeFilterLabel ?? 'Filter time'}
        </Text>
        {activeFilterLabel && (
          <Pressable
            style={styles.clearFilterButton}
            onPress={(event) => {
              event.stopPropagation();
              onClearFilter();
            }}
          >
            <Text style={styles.clearFilterText}>X</Text>
          </Pressable>
        )}
      </Pressable>
      <Pressable
        style={[styles.actionButton, styles.progressActionButton, styles.exportButton, exporting && styles.actionDisabled]}
        onPress={onExport}
        disabled={exporting}
      >
        <AppIcon iosName="doc.on.doc" androidFallback="PDF" size={16} color={isDark ? themeColors.neutral : themeColors.textLight} />
        <Text style={styles.exportButtonText} numberOfLines={1}>{exporting ? 'Creating PDF...' : 'Export as PDF'}</Text>
      </Pressable>
    </View>
  );
}

function InsightRow({ post, onPress }: { post: InsightPost; onPress: () => void }) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.rowIconWrap}>
        <AppIcon iosName="newspaper.fill" androidFallback="I" size={16} color={themeColors.secondary} />
      </View>
      <View style={styles.rowMain}>
        <View style={styles.insightRowTitleLine}>
          <Text style={[styles.rowTitle, styles.insightRowTitle]} numberOfLines={2}>{post.title}</Text>
          {isNewInsight(post) && <Text style={styles.newBadge}>New</Text>}
        </View>
        <Text style={styles.rowSubtitle} numberOfLines={2}>{post.introduction}</Text>
        <Text style={styles.rowMeta}>{formatInsightDate(post.publishedAt)} · {formatReadingTime(post.readingMinutes)}</Text>
      </View>
      <AppIcon iosName="chevron.right" androidFallback=">" size={20} color={themeColors.textMuted} />
    </Pressable>
  );
}

function InsightDetailModal({
  post,
  onClose,
  onBackToProgress,
  onOpenLink,
  onExport,
  onToggleSave,
}: {
  post: InsightPost | null;
  onClose: () => void;
  onBackToProgress: () => void;
  onOpenLink: (url: string) => void;
  onExport: (post: InsightPost) => void;
  onToggleSave: (post: InsightPost) => void;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [introOpen, setIntroOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const entrance = useRef(new Animated.Value(0)).current;
  const flare = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!post) return;
    setResourcesOpen(false);
    setTagsOpen(true);
    setIntroOpen(true);
    setSummaryOpen(true);
    entrance.setValue(0);
    Animated.spring(entrance, {
      toValue: 1,
      friction: 9,
      tension: 110,
      useNativeDriver: true,
    }).start();
  }, [entrance, post?.id]);

  useEffect(() => {
    if (!post) return;
    flare.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flare, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(flare, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [flare, post?.id]);

  if (!post) return null;

  const modalAnimatedStyle: any = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
      {
        scale: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [0.97, 1],
        }),
      },
    ],
  };
  const flareAnimatedStyle: any = {
    opacity: flare.interpolate({
      inputRange: [0, 0.35, 0.7, 1],
      outputRange: [0, 0.55, 0.22, 0],
    }),
    transform: [
      {
        translateX: flare.interpolate({
          inputRange: [0, 1],
          outputRange: [-120, 120],
        }),
      },
      { rotate: '-18deg' },
    ],
  };

  return (
    <M3BottomSheet visible={!!post} onClose={onClose}>
      <Animated.View style={[styles.insightSheetContent, modalAnimatedStyle]}>
        <View style={styles.modalHeader}>
          <Pressable style={styles.insightHeaderButton} onPress={onBackToProgress}>
            <AppIcon iosName="chevron.left" androidFallback="<" size={18} color={themeColors.secondary} />
            <Text style={styles.insightHeaderBackText}>Back</Text>
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.insightDetailTitleRow}>
              <Text style={styles.insightDetailTitle}>{post.title}</Text>
              {isNewInsight(post) && <Text style={styles.newBadge}>New</Text>}
            </View>

            <View style={styles.insightMetaRow}>
              <View style={styles.insightMetaPill}>
                <AppIcon iosName="calendar" androidFallback="D" size={14} color={themeColors.secondary} />
                <Text style={styles.insightMetaText}>{formatInsightDate(post.publishedAt)}</Text>
              </View>
              <View style={styles.insightMetaPill}>
                <AppIcon iosName="clock" androidFallback="T" size={14} color={themeColors.secondary} />
                <Text style={styles.insightMetaText}>{formatReadingTime(post.readingMinutes)}</Text>
              </View>
            </View>

            <InsightSectionToggle
              title="Tags"
              open={tagsOpen}
              onPress={() => setTagsOpen((open) => !open)}
            />
            <AnimatedInsightSection open={tagsOpen}>
              <View style={styles.tagsWrap}>
                {post.tags.map((tag) => (
                  <Text key={tag} style={styles.tagPill}>{tag}</Text>
                ))}
              </View>
            </AnimatedInsightSection>

            <InsightSectionToggle
              title="Introduction"
              open={introOpen}
              onPress={() => setIntroOpen((open) => !open)}
            />
            <AnimatedInsightSection open={introOpen}>
              <Text style={styles.insightBody}>{post.introduction}</Text>
            </AnimatedInsightSection>

            <InsightSectionToggle
              title="Summary"
              open={summaryOpen}
              onPress={() => setSummaryOpen((open) => !open)}
            />
            <AnimatedInsightSection open={summaryOpen}>
              <Text style={styles.insightBody}>{post.summary}</Text>
            </AnimatedInsightSection>

            <Pressable style={styles.articleLinkButton} onPress={() => onOpenLink(post.articleUrl)}>
              <Animated.View pointerEvents="none" style={[styles.articleLinkFlare, flareAnimatedStyle]} />
              <AppIcon iosName="sparkles" androidFallback="*" size={15} color={themeColors.secondary} />
              <AppIcon iosName="link" androidFallback="L" size={16} color={themeColors.secondary} />
              <Text style={styles.articleLinkText}>Open full article</Text>
            </Pressable>

            <Pressable style={styles.resourcesToggle} onPress={() => setResourcesOpen((open) => !open)}>
              <Text style={styles.resourcesToggleText}>Resources</Text>
              <AppIcon
                iosName={resourcesOpen ? 'chevron.up' : 'chevron.down'}
                androidFallback={resourcesOpen ? "^" : "v"}
                size={16}
                color={themeColors.secondary}
              />
            </Pressable>

            <AnimatedInsightSection open={resourcesOpen}>
              <Pressable style={styles.resourcesPanel} onPress={() => onOpenLink(post.articleUrl)}>
                <Text style={styles.insightBody}>{post.source}</Text>
                <Text style={styles.insightBody}>{post.institution}</Text>
                <Text style={styles.resourceLinkText}>{post.articleUrl}</Text>
              </Pressable>
            </AnimatedInsightSection>

            <View style={styles.insightActions}>
              <Pressable style={[styles.actionButton, styles.exportButton, styles.insightActionButton]} onPress={() => onExport(post)}>
                <AppIcon iosName="doc.on.doc" androidFallback="PDF" size={16} color={isDark ? themeColors.neutral : themeColors.textLight} />
                <Text style={styles.exportButtonText}>Export as PDF</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.insightActionButton]} onPress={() => onToggleSave(post)}>
                <AppIcon iosName={post.saved ? 'bookmark.fill' : 'bookmark'} androidFallback="B" size={16} color={themeColors.secondary} />
                <Text style={styles.actionButtonText}>Save</Text>
              </Pressable>
            </View>
        </ScrollView>
      </Animated.View>
    </M3BottomSheet>
  );
}

function InsightSectionToggle({
  title,
  open,
  onPress,
}: {
  title: string;
  open: boolean;
  onPress: () => void;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  return (
    <Pressable style={styles.insightSectionToggle} onPress={onPress}>
      <Text style={styles.insightSectionLabel}>{title}</Text>
      <AppIcon
        iosName={open ? 'chevron.up' : 'chevron.down'}
        androidFallback={open ? "^" : "v"}
        size={16}
        color={themeColors.secondary}
      />
    </Pressable>
  );
}

function AnimatedInsightSection({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, progress]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-6, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

function SavedInsightsModal({
  visible,
  posts,
  onClose,
  onOpenPost,
}: {
  visible: boolean;
  posts: InsightPost[];
  onClose: () => void;
  onOpenPost: (post: InsightPost) => void;
}) {
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.savedInsightsCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Saved Posts</Text>
            <Pressable style={styles.modalCloseButton} onPress={onClose}>
              <Text style={styles.modalCloseText}>X</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {posts.length > 0 ? posts.map((post) => (
              <InsightRow key={post.id} post={post} onPress={() => onOpenPost(post)} />
            )) : (
              <Text style={styles.emptyText}>No saved posts yet.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FilterModal({
  visible,
  selectedFilter,
  selectedDate,
  selectedDateOptions,
  selectedDateLabel,
  customFromValue,
  customToValue,
  onFilterChange,
  onDateValueChange,
  onOpenCalendar,
  onApply,
  onClose,
}: {
  visible: boolean;
  selectedFilter: FilterKey;
  selectedDate: DateOption | undefined;
  selectedDateOptions: DateOption[];
  selectedDateLabel: string;
  customFromValue: string;
  customToValue: string;
  onFilterChange: (filter: FilterKey) => void;
  onDateValueChange: (value: string) => void;
  onOpenCalendar: (target: 'day' | 'from' | 'to') => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    scale.setValue(0.96);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale, visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.modalOverlay, { opacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[styles.filterModalCard, { transform: [{ scale }] }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Filter time</Text>
          <Pressable style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>X</Text>
          </Pressable>
        </View>

        <Text style={styles.filterLabel}>Filter time:</Text>
        <View style={styles.filterControls}>
          <SelectDropdown
            value={selectedFilter}
            label={FILTERS.find((filter) => filter.key === selectedFilter)?.label ?? 'Day'}
            options={FILTERS.map((filter) => ({ label: filter.label, value: filter.key }))}
            onSelect={(value) => onFilterChange(value as FilterKey)}
          />
          {selectedFilter === 'custom' ? (
            <>
              <CalendarField
                label={`From ${formatShortDate(fromISODate(customFromValue))}`}
                onPress={() => onOpenCalendar('from')}
              />
              <CalendarField
                label={`To ${formatShortDate(fromISODate(customToValue))}`}
                onPress={() => onOpenCalendar('to')}
              />
            </>
          ) : selectedFilter === 'day' ? (
            <CalendarField
              label={selectedDateLabel}
              onPress={() => onOpenCalendar('day')}
            />
          ) : (
            <SelectDropdown
              value={selectedDate?.value ?? ''}
              label={selectedDate?.label ?? ''}
              options={selectedDateOptions}
              onSelect={onDateValueChange}
              disabled={!selectedFilter}
            />
          )}
        </View>

        <View style={styles.modalActions}>
          <Pressable style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.modalButton, styles.modalApplyButton]} onPress={onApply}>
            <Text style={styles.modalApplyText}>Apply filter</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function ReportPanel({
  eyebrow,
  title,
  summary,
  quizCount,
}: {
  eyebrow: string;
  title: string;
  summary: ReturnType<typeof summarize>;
  quizCount: number;
}) {
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  return (
    <AdaptiveCard style={styles.reportPanel}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.reportTitle}>{title}</Text>
      </View>
      <View style={styles.scoreGrid}>
        <Metric label="Score" value={`${summary.averagePercent}%`} />
        <Metric label="Points" value={`${summary.pointsEarned}/${summary.pointsTotal}`} />
        <Metric label="Threshold" value={`${thresholdStage(summary.averagePercent)}/5`} />
        <Metric label="Quizzes" value={String(quizCount)} />
      </View>
      <Text style={styles.reportNote}>
        {summary.completed} completed attempts from {summary.attempts} total attempts.
      </Text>
    </AdaptiveCard>
  );
}

function TypeRow({
  label,
  description,
  quizCount,
  onPress,
}: {
  label: string;
  description: string;
  quizCount: number;
  onPress?: () => void;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        onPress && pressed ? styles.rowPressed : undefined,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowIconWrap}>
        <AppIcon iosName="chart.bar.fill" androidFallback="Q" size={16} color={themeColors.secondary} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{description}</Text>
        <Text style={styles.rowMeta}>{quizCount} quizzes</Text>
      </View>
      {onPress && (
        <AppIcon iosName="chevron.right" androidFallback=">" size={20} color={themeColors.textMuted} />
      )}
    </Pressable>
  );
}

function QuizRow({ quiz, onPress }: { quiz: QuizReport; onPress?: () => void }) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const summary = summarize([quiz]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        onPress && pressed ? styles.rowPressed : undefined,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowIconWrap}>
        <AppIcon iosName="questionmark.circle.fill" androidFallback="?" size={16} color={themeColors.secondary} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{quiz.name}</Text>
        <Text style={styles.rowSubtitle}>{quiz.completed} completed attempts</Text>
        <Text style={styles.rowMeta}>{quiz.attempts} total attempts</Text>
      </View>
      <View style={styles.rowScore}>
        <Text style={styles.percent}>{summary.averagePercent}%</Text>
        <Text style={styles.points}>{summary.pointsEarned}/{summary.pointsTotal}</Text>
        <Text style={styles.stage}>{thresholdStage(summary.averagePercent)}/5</Text>
      </View>
      {onPress && (
        <AppIcon iosName="chevron.right" androidFallback=">" size={20} color={themeColors.textMuted} />
      )}
    </Pressable>
  );
}

function QuizAttemptDetails({ quiz }: { quiz: QuizReport }) {
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  const outcomes = quiz.questionOutcomes;

  return (
    <View>
      <SectionHeader
        icon="checkmark.circle.fill"
        fallback="✓"
        title="Question feedback"
        helper="Recorded answers"
      />
      {outcomes.length > 0 ? outcomes.map((outcome) => (
        <AdaptiveCard key={outcome.id} style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionPrompt}>{outcome.prompt}</Text>
            <Text style={[
              styles.questionStatus,
              outcome.status === 'Correct' ? styles.statusCorrect : undefined,
              outcome.status === 'Wrong' ? styles.statusWrong : undefined,
              outcome.status === 'Skipped' ? styles.statusSkipped : undefined,
            ]}>
              {outcome.status}
            </Text>
          </View>
          <View style={styles.questionMetaGrid}>
            <Metric label="Tries" value={String(outcome.attemptsUntilResult)} />
            <Metric label="Time" value={outcome.duration} />
          </View>
          <Text style={styles.questionTakenAt}>Taken {formatTakenAt(outcome.takenAt)}</Text>
        </AdaptiveCard>
      )) : (
        <Text style={styles.emptyText}>No answers recorded for this quiz in the selected period.</Text>
      )}
    </View>
  );
}

function ReportCharts({
  quizzes,
  selectedFilter,
}: {
  quizzes: QuizReport[];
  selectedFilter: FilterKey;
}) {
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  const maxAttempts = Math.max(...quizzes.map((quiz) => quiz.attempts), 1);
  const stageCounts = [1, 2, 3, 4, 5].map((stage) => ({
    stage,
    count: quizzes.filter((quiz) => thresholdStage(quiz.averagePercent) === stage).length,
  }));
  const maxStageCount = Math.max(...stageCounts.map((item) => item.count), 1);
  const selectedLabel = FILTERS.find((filter) => filter.key === selectedFilter)?.label ?? 'Week';
  const animationKey = `${selectedFilter}-${quizzes.map((quiz) => `${quiz.id}:${quiz.averagePercent}:${quiz.attempts}:${quiz.completed}`).join('|')}`;

  return (
    <View style={styles.chartsSection}>
      <AdaptiveCard style={styles.chartPanel}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Quiz score comparison</Text>
          <Text style={styles.chartRange}>{selectedLabel}</Text>
        </View>
        {quizzes.map((quiz, index) => (
          <AnimatedChartRow key={quiz.id} animationKey={animationKey} index={index}>
            <View style={styles.barLabelWrap}>
              <Text style={styles.barLabel} numberOfLines={1}>{quiz.name}</Text>
              <Text style={styles.barSubLabel}>{quiz.pointsEarned}/{quiz.pointsTotal} pts</Text>
            </View>
            <View style={styles.barTrack}>
              <AnimatedChartBar
                percent={quiz.averagePercent}
                style={styles.scoreBar}
                delay={index * 55}
                animationKey={animationKey}
              />
            </View>
            <Text style={styles.barValue}>{quiz.averagePercent}%</Text>
          </AnimatedChartRow>
        ))}
      </AdaptiveCard>

      <AdaptiveCard style={styles.chartPanel}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Report distribution</Text>
          <Text style={styles.chartRange}>1/5 - 5/5</Text>
        </View>
        <View style={styles.stageChart}>
          {stageCounts.map((item) => (
            <View key={item.stage} style={styles.stageColumn}>
              <View style={styles.stageTrack}>
                <AnimatedStageBar
                  percent={Math.max((item.count / maxStageCount) * 100, item.count > 0 ? 12 : 0)}
                  style={styles.stageBar}
                  delay={item.stage * 70}
                  animationKey={animationKey}
                />
              </View>
              <Text style={styles.stageCount}>{item.count}</Text>
              <Text style={styles.stageLabel}>{item.stage}/5</Text>
            </View>
          ))}
        </View>
      </AdaptiveCard>

      <AdaptiveCard style={styles.chartPanel}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Attempts by quiz</Text>
          <Text style={styles.chartRange}>{quizzes.reduce((sum, quiz) => sum + quiz.attempts, 0)} total</Text>
        </View>
        {quizzes.map((quiz, index) => (
          <AnimatedChartRow key={`${quiz.id}-attempts`} animationKey={animationKey} index={index + quizzes.length}>
            <View style={styles.barLabelWrap}>
              <Text style={styles.barLabel} numberOfLines={1}>{quiz.name}</Text>
              <Text style={styles.barSubLabel}>{quiz.completed} completed</Text>
            </View>
            <View style={styles.barTrack}>
              <AnimatedChartBar
                percent={Math.max((quiz.attempts / maxAttempts) * 100, quiz.attempts > 0 ? 6 : 0)}
                style={styles.attemptBar}
                delay={index * 55}
                animationKey={animationKey}
              />
            </View>
            <Text style={styles.barValue}>{quiz.attempts}</Text>
          </AnimatedChartRow>
        ))}
      </AdaptiveCard>
    </View>
  );
}

function AnimatedChartRow({
  animationKey,
  index,
  children,
}: {
  animationKey: string;
  index: number;
  children: React.ReactNode;
}) {
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index * 35, 260),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animationKey, index, progress]);

  return (
    <Animated.View
      style={[
        styles.barRow,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function AnimatedChartBar({
  percent,
  style,
  delay,
  animationKey,
}: {
  percent: number;
  style: any;
  delay: number;
  animationKey: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const clampedPercent = Math.max(0, Math.min(percent, 100));

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: clampedPercent,
      duration: 680,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animationKey, clampedPercent, delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          width: progress.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%'],
          }),
        },
      ]}
    />
  );
}

function AnimatedStageBar({
  percent,
  style,
  delay,
  animationKey,
}: {
  percent: number;
  style: any;
  delay: number;
  animationKey: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const clampedPercent = Math.max(0, Math.min(percent, 100));

  useEffect(() => {
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: clampedPercent,
      delay,
      friction: 8,
      tension: 80,
      useNativeDriver: false,
    }).start();
  }, [animationKey, clampedPercent, delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          height: progress.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%'],
          }),
        },
      ]}
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors.neutral,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 26,
    color: themeColors.textDark,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: themeColors.textMuted,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    overflow: 'visible',
  },
  actionRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: 10,
  },
  actionButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
    backgroundColor: themeColors.glassCardBg,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  progressActionButton: {
    flex: 1,
    minWidth: 0,
  },
  filterActionButton: {
    maxWidth: '100%',
  },
  filterActionButtonActive: {
    justifyContent: 'flex-start',
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(45,79,62,0.3)'),
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(45,79,62,0.08)'),
  },
  actionButtonText: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.secondary,
    marginLeft: 8,
  },
  exportButton: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: (isDark ? themeColors.neutral : themeColors.textLight),
    marginLeft: 8,
  },
  clearFilterButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearFilterText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: themeColors.secondary,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.42)'),
    zIndex: 100,
    elevation: 100,
  },
  filterModalCard: {
    borderRadius: isIOS ? 20 : 24,
    padding: 16,
    backgroundColor: themeColors.glassCardBg,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.08)'),
    zIndex: 60,
    elevation: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 19,
    color: themeColors.textDark,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.05)'),
  },
  modalCloseText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.textDark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  modalButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: isIOS ? 14 : 16,
    paddingHorizontal: 14,
    marginLeft: 8,
  },
  modalCancelButton: {
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.05)'),
  },
  modalApplyButton: {
    backgroundColor: themeColors.secondary,
  },
  modalCancelText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.textDark,
  },
  modalApplyText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.textLight,
  },
  patientPanel: {
    padding: 16,
    marginBottom: 16,
    overflow: 'visible',
    zIndex: 1000,
    elevation: 1000,
  },
  dropdownContainer: {
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
    backgroundColor: themeColors.glassCardBg,
    overflow: 'hidden',
  },
  patientSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  patientSelectorOpen: {
    borderBottomWidth: 1,
    borderBottomColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.06)'),
  },
  patientSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  patientInitialCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(45,79,62,0.12)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInitialText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: themeColors.secondary,
  },
  patientSelectorName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: themeColors.textDark,
  },
  patientSelectorRole: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 1,
  },
  dropdownList: {
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.05)' : 'rgba(255,255,255,0.3)'),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.04)'),
    gap: 12,
  },
  patientInitialCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.05)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInitialTextSmall: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: themeColors.textDark,
  },
  dropdownItemText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.textDark,
  },
  emptyText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.textMuted,
  },
  filterLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.textDark,
    marginBottom: 10,
  },
  filterControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: -8,
  },
  selectWrap: {
    minWidth: '46%',
    flexGrow: 1,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  selectWrapOpen: {
    zIndex: 1100,
    elevation: 1100,
  },
  selectButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
    backgroundColor: themeColors.glassCardBg,
    paddingHorizontal: 12,
  },
  selectDisabled: {
    opacity: 0.45,
  },
  selectText: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: themeColors.textDark,
    marginLeft: 6,
  },
  selectTextDisabled: {
    color: themeColors.textMuted,
  },
  selectChevron: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: themeColors.secondary,
    marginLeft: 8,
  },
  selectMenu: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.08)'),
    backgroundColor: themeColors.neutralLight,
    overflow: 'hidden',
    zIndex: 1200,
    elevation: 1200,
  },
  selectMenuScroll: {
    maxHeight: 240,
  },
  selectOption: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.05)'),
  },
  selectOptionActive: {
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(3, 87, 58, 0.10)'),
  },
  selectOptionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.textDark,
  },
  selectOptionTextActive: {
    fontFamily: typography.fontFamily.bold,
    color: themeColors.secondary,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingRight: 12,
    marginBottom: 8,
  },
  backButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.secondary,
  },
  reportPanel: {
    padding: 16,
    marginBottom: 18,
  },
  eyebrow: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: themeColors.secondary,
    textTransform: 'uppercase',
  },
  reportTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 21,
    color: themeColors.textDark,
    marginTop: 4,
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 14,
  },
  metric: {
    width: '50%',
    padding: 4,
  },
  metricLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: themeColors.textMuted,
  },
  metricValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: themeColors.textDark,
    marginTop: 2,
  },
  reportNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: themeColors.textMuted,
    marginTop: 10,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.textDark,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(45,79,62,0.1)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
  },
  helperTextInline: {
    fontFamily: typography.fontFamily.regular,
    color: themeColors.textMuted,
    fontSize: 12,
  },
  chartsSection: {
    marginBottom: 18,
  },
  chartPanel: {
    padding: 14,
    marginBottom: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: themeColors.textDark,
    paddingRight: 10,
  },
  chartRange: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: themeColors.secondary,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginBottom: 8,
  },
  barLabelWrap: {
    width: 112,
    paddingRight: 8,
  },
  barLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: themeColors.textDark,
  },
  barSubLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: themeColors.textMuted,
    marginTop: 2,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(3, 87, 58, 0.10)'),
    overflow: 'hidden',
  },
  scoreBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: themeColors.primary,
  },
  attemptBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: themeColors.primary,
  },
  barValue: {
    width: 42,
    textAlign: 'right',
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: themeColors.textDark,
  },
  stageChart: {
    height: 150,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  stageColumn: {
    flex: 1,
    alignItems: 'center',
  },
  stageTrack: {
    width: 24,
    height: 96,
    borderRadius: 8,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(3, 87, 58, 0.10)'),
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  stageBar: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: themeColors.secondary,
  },
  stageCount: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: themeColors.textDark,
    marginTop: 6,
  },
  stageLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: themeColors.textMuted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: isIOS ? 14 : 16,
    padding: 14,
    backgroundColor: themeColors.glassCardBg,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
    marginBottom: 10,
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowMain: {
    flex: 1,
    paddingRight: 12,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(45,79,62,0.1)'),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.textDark,
  },
  rowSubtitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.textMuted,
    marginTop: 2,
  },
  rowMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 6,
  },
  rowScore: {
    minWidth: 76,
    alignItems: 'flex-end',
  },
  percent: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: themeColors.textDark,
  },
  points: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 2,
  },
  stage: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: themeColors.secondary,
    marginTop: 4,
  },
  insightsDivider: {
    height: 1,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.14)' : 'rgba(0,0,0,0.12)'),
    marginTop: 16,
    marginBottom: 18,
  },
  insightsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  insightsTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: themeColors.textDark,
  },
  bookmarkButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.glassCardBg,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
  },
  insightRowTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  insightRowTitle: {
    flex: 1,
  },
  newBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: (isDark ? 'rgba(155, 231, 180, 0.18)' : 'rgba(30, 111, 67, 0.12)'),
    color: themeColors.secondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
  },
  insightSheetContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24,
  },
  savedInsightsCard: {
    width: '92%',
    maxHeight: '72%',
    borderRadius: 22,
    backgroundColor: themeColors.neutral,
    padding: 18,
  },
  insightDetailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  insightDetailTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: themeColors.textDark,
    paddingRight: 8,
  },
  insightHeaderButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  insightHeaderBackText: {
    marginLeft: 4,
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.secondary,
  },
  insightMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 10,
  },
  insightMetaPill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.10)' : 'rgba(45,79,62,0.08)'),
  },
  insightMetaText: {
    marginLeft: 6,
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.textMuted,
  },
  insightSectionLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.textDark,
    paddingRight: 10,
  },
  insightSectionToggle: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 6,
  },
  insightBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: themeColors.textMuted,
  },
  articleLinkButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginTop: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(155, 231, 180, 0.28)' : 'rgba(3, 87, 58, 0.16)'),
    backgroundColor: (isDark ? 'rgba(155, 231, 180, 0.08)' : 'rgba(45,79,62,0.06)'),
    overflow: 'hidden',
    position: 'relative',
  },
  articleLinkFlare: {
    position: 'absolute',
    top: -18,
    bottom: -18,
    width: 42,
    backgroundColor: (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.72)'),
  },
  articleLinkText: {
    marginLeft: 8,
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: themeColors.secondary,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    marginHorizontal: -3,
  },
  tagPill: {
    margin: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.10)' : 'rgba(0,0,0,0.05)'),
    color: themeColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
  },
  resourcesToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 6,
  },
  resourcesToggleText: {
    flex: 1,
    paddingRight: 10,
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.textDark,
  },
  resourcesPanel: {
    marginTop: 0,
  },
  resourceLinkText: {
    marginTop: 6,
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: themeColors.secondary,
  },
  insightActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -4,
    marginTop: 18,
    paddingBottom: 10,
  },
  insightActionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  questionCard: {
    padding: 14,
    marginBottom: 10,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  questionPrompt: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: themeColors.textDark,
    paddingRight: 10,
  },
  questionStatus: {
    minWidth: 72,
    textAlign: 'center',
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    borderRadius: 8,
    overflow: 'hidden',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statusCorrect: {
    color: '#1E6F43',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 111, 67, 0.12)'),
  },
  statusWrong: {
    color: '#A33A2A',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(163, 58, 42, 0.12)'),
  },
  statusSkipped: {
    color: '#7A5A12',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(122, 90, 18, 0.12)'),
  },
  questionMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 10,
  },
  questionTakenAt: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 8,
  },
});
};
// Styles are resolved per-render via `getStyles(isDark)` inside components
