import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, View, Text, StyleSheet, ScrollView, Pressable, LayoutAnimation, UIManager, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DatePickerModal } from 'react-native-paper-dates';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { CaregiverAvatarButton } from '../../src/components/CaregiverAvatarButton';
import { AdaptiveCard } from '../../src/components/AdaptiveCard';
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
const CAREGIVER_REGISTERED_AT = new Date(2024, 0, 12);

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

function getFilterScopeLabel(filter: FilterKey, dateValue: string, customFrom: string, customTo: string) {
  if (filter === 'custom') {
    return `${formatShortDate(fromISODate(customFrom))} - ${formatShortDate(fromISODate(customTo))}`;
  }

  if (filter === 'day') {
    return formatLongDate(fromISODate(dateValue));
  }

  const option = DATE_OPTIONS[filter].find((item) => item.value === dateValue) ?? DATE_OPTIONS[filter][0];
  return option?.label ?? '';
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

const DATE_OPTIONS: Record<Exclude<FilterKey, 'custom'>, DateOption[]> = {
  day: [
    { label: formatLongDate(TODAY), value: toISODate(TODAY) },
  ],
  week: [
    { label: 'May 4th - May 10th, 2026', value: '2026-W19' },
    { label: 'April 27th - May 3rd, 2026', value: '2026-W18' },
    { label: 'April 20th - April 26th, 2026', value: '2026-W17' },
  ],
  month: buildMonthOptions(CAREGIVER_REGISTERED_AT, TODAY),
  year: buildYearOptions(CAREGIVER_REGISTERED_AT, TODAY),
};

const DEFAULT_CUSTOM_FROM = '2026-05-01';
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

function dateRangeForFilter(filter: AppliedFilter | null): { start: Date; end: Date } | null {
  if (!filter) return null;

  if (filter.filter === 'day') {
    const start = fromISODate(filter.dateValue);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (filter.filter === 'month') {
    const [year, month] = filter.dateValue.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (filter.filter === 'year') {
    const year = Number(filter.dateValue);
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }

  if (filter.filter === 'custom') {
    const start = fromISODate(filter.customFrom);
    const end = fromISODate(filter.customTo);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function applyTimeFilterToQuiz(quiz: QuizReport, filter: AppliedFilter | null): QuizReport {
  const range = dateRangeForFilter(filter);
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

export default function AnalyticsTab() {
  const router = useRouter();
  const [draftFilter, setDraftFilter] = useState<FilterKey>('day');
  const [draftDateValue, setDraftDateValue] = useState(DATE_OPTIONS.day[0].value);
  const [draftCustomFrom, setDraftCustomFrom] = useState(DEFAULT_CUSTOM_FROM);
  const [draftCustomTo, setDraftCustomTo] = useState(DEFAULT_CUSTOM_TO);
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter | null>(null);
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
    () => detailQuizzes.map((quiz) => applyTimeFilterToQuiz(quiz, appliedFilter)),
    [detailQuizzes, appliedFilter]
  );
  const detailSummary = summarize(visibleDetailQuizzes);
  const detailTitle = isOverallSelected ? 'All quiz types' : selectedType?.description ?? '';
  const detailEyebrow = isOverallSelected ? 'Overall' : `${selectedType?.label} overall`;
  const draftDateOptions = draftFilter === 'custom' ? [] : DATE_OPTIONS[draftFilter];
  const draftDate = draftDateOptions.find((option) => option.value === draftDateValue) ?? draftDateOptions[0];
  const draftDateLabel = getFilterScopeLabel(draftFilter, draftDateValue, draftCustomFrom, draftCustomTo);
  const selectedQuiz = visibleDetailQuizzes.find((quiz) => quiz.id === selectedQuizId) ?? null;
  const selectedQuizSummary = selectedQuiz ? summarize([selectedQuiz]) : null;
  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
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

    const fetchProgress = async () => {
      if (!selectedPatientId) {
        setQuizTypes([]);
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
      setDraftDateValue(DATE_OPTIONS[filter][0].value);
    }
  };
  const activeFilterLabel = appliedFilter
    ? `${FILTERS.find((filter) => filter.key === appliedFilter.filter)?.label ?? 'Day'}: ${getFilterScopeLabel(appliedFilter.filter, appliedFilter.dateValue, appliedFilter.customFrom, appliedFilter.customTo)}`
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
    setDraftDateValue(DATE_OPTIONS.day[0].value);
    setDraftCustomFrom(DEFAULT_CUSTOM_FROM);
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
          patientName: selectedPatient?.label ?? 'No patient selected',
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
              <AppIcon iosName="chevron.left" androidFallback="<" size={18} color={colors.secondary} />
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
                      color={colors.textMuted}
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
                            <AppIcon iosName="checkmark" androidFallback="✓" size={14} color={colors.secondary} />
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
          </>
        )}
      </ScrollView>

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
          setAppliedFilter({
            filter: draftFilter,
            dateValue: draftDateValue,
            customFrom: draftCustomFrom,
            customTo: draftCustomTo,
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
          const iso = toISODate(date);
          if (datePickerTarget === 'from') {
            setDraftCustomFrom(iso);
          } else if (datePickerTarget === 'to') {
            setDraftCustomTo(iso);
          } else {
            setDraftDateValue(iso);
          }
        }}
        validRange={{ startDate: CAREGIVER_REGISTERED_AT, endDate: TODAY }}
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
          <AppIcon iosName="calendar" androidFallback="C" size={16} color={colors.secondary} />
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
  return (
    <View style={styles.selectWrap}>
      <Pressable style={styles.selectButton} onPress={onPress}>
        <AppIcon iosName="calendar" androidFallback="C" size={16} color={colors.secondary} />
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
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <AppIcon iosName={icon} androidFallback={fallback} size={16} color={colors.secondary} />
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
  return (
    <View style={styles.actionRow}>
      <Pressable
        style={[styles.actionButton, styles.filterActionButton, activeFilterLabel && styles.filterActionButtonActive]}
        onPress={onOpenFilter}
      >
        <AppIcon iosName="calendar" androidFallback="C" size={16} color={colors.secondary} />
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
        style={[styles.actionButton, styles.exportButton, exporting && styles.actionDisabled]}
        onPress={onExport}
        disabled={exporting}
      >
        <AppIcon iosName="doc.on.doc" androidFallback="PDF" size={16} color={colors.textLight} />
        <Text style={styles.exportButtonText}>{exporting ? 'Creating PDF...' : 'Export as PDF'}</Text>
      </Pressable>
    </View>
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
        <AppIcon iosName="chart.bar.fill" androidFallback="Q" size={16} color={colors.secondary} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{description}</Text>
        <Text style={styles.rowMeta}>{quizCount} quizzes</Text>
      </View>
      {onPress && (
        <AppIcon iosName="chevron.right" androidFallback=">" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function QuizRow({ quiz, onPress }: { quiz: QuizReport; onPress?: () => void }) {
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
        <AppIcon iosName="questionmark.circle.fill" androidFallback="?" size={16} color={colors.secondary} />
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
        <AppIcon iosName="chevron.right" androidFallback=">" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function QuizAttemptDetails({ quiz }: { quiz: QuizReport }) {
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
  const maxAttempts = Math.max(...quizzes.map((quiz) => quiz.attempts), 1);
  const stageCounts = [1, 2, 3, 4, 5].map((stage) => ({
    stage,
    count: quizzes.filter((quiz) => thresholdStage(quiz.averagePercent) === stage).length,
  }));
  const maxStageCount = Math.max(...stageCounts.map((item) => item.count), 1);
  const selectedLabel = FILTERS.find((filter) => filter.key === selectedFilter)?.label ?? 'Week';

  return (
    <View style={styles.chartsSection}>
      <AdaptiveCard style={styles.chartPanel}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Quiz score comparison</Text>
          <Text style={styles.chartRange}>{selectedLabel}</Text>
        </View>
        {quizzes.map((quiz) => (
          <View key={quiz.id} style={styles.barRow}>
            <View style={styles.barLabelWrap}>
              <Text style={styles.barLabel} numberOfLines={1}>{quiz.name}</Text>
              <Text style={styles.barSubLabel}>{quiz.pointsEarned}/{quiz.pointsTotal} pts</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.scoreBar, { width: `${quiz.averagePercent}%` }]} />
            </View>
            <Text style={styles.barValue}>{quiz.averagePercent}%</Text>
          </View>
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
                <View
                  style={[
                    styles.stageBar,
                    { height: `${Math.max((item.count / maxStageCount) * 100, item.count > 0 ? 12 : 0)}%` },
                  ]}
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
        {quizzes.map((quiz) => (
          <View key={`${quiz.id}-attempts`} style={styles.barRow}>
            <View style={styles.barLabelWrap}>
              <Text style={styles.barLabel} numberOfLines={1}>{quiz.name}</Text>
              <Text style={styles.barSubLabel}>{quiz.completed} completed</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.attemptBar, { width: `${Math.max((quiz.attempts / maxAttempts) * 100, 6)}%` }]} />
            </View>
            <Text style={styles.barValue}>{quiz.attempts}</Text>
          </View>
        ))}
      </AdaptiveCard>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral,
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
    color: colors.textDark,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
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
    flexWrap: 'wrap',
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
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.55)' : '#FFFFFF',
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  filterActionButton: {
    maxWidth: '100%',
  },
  filterActionButtonActive: {
    justifyContent: 'flex-start',
    borderColor: 'rgba(45,79,62,0.3)',
    backgroundColor: 'rgba(45,79,62,0.08)',
  },
  actionButtonText: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.secondary,
    marginLeft: 8,
  },
  exportButton: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textLight,
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
    color: colors.secondary,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    zIndex: 100,
    elevation: 100,
  },
  filterModalCard: {
    borderRadius: isIOS ? 20 : 24,
    padding: 16,
    backgroundColor: isIOS ? 'rgba(255,255,255,0.96)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
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
    color: colors.textDark,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalCloseText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalApplyButton: {
    backgroundColor: colors.secondary,
  },
  modalCancelText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
  },
  modalApplyText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textLight,
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
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
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
    borderBottomColor: 'rgba(0,0,0,0.06)',
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
    backgroundColor: 'rgba(45,79,62,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInitialText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.secondary,
  },
  patientSelectorName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
  },
  patientSelectorRole: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  dropdownList: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.04)',
    gap: 12,
  },
  patientInitialCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInitialTextSmall: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textDark,
  },
  dropdownItemText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
  },
  emptyText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  filterLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
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
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.55)' : '#FFFFFF',
    paddingHorizontal: 12,
  },
  selectDisabled: {
    opacity: 0.45,
  },
  selectText: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: colors.textDark,
    marginLeft: 6,
  },
  selectTextDisabled: {
    color: colors.textMuted,
  },
  selectChevron: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
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
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: colors.neutralLight,
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
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  selectOptionActive: {
    backgroundColor: 'rgba(3, 87, 58, 0.10)',
  },
  selectOptionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textDark,
  },
  selectOptionTextActive: {
    fontFamily: typography.fontFamily.bold,
    color: colors.secondary,
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
    color: colors.secondary,
  },
  reportPanel: {
    padding: 16,
    marginBottom: 18,
  },
  eyebrow: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
    textTransform: 'uppercase',
  },
  reportTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 21,
    color: colors.textDark,
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
    color: colors.textMuted,
  },
  metricValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    marginTop: 2,
  },
  reportNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
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
    backgroundColor: 'rgba(45,79,62,0.1)',
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
    color: colors.textMuted,
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
    color: colors.textDark,
    paddingRight: 10,
  },
  chartRange: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
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
    color: colors.textDark,
  },
  barSubLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(3, 87, 58, 0.10)',
    overflow: 'hidden',
  },
  scoreBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: colors.secondary,
  },
  attemptBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#7AAE8A',
  },
  barValue: {
    width: 42,
    textAlign: 'right',
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.textDark,
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
    backgroundColor: 'rgba(3, 87, 58, 0.10)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  stageBar: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: colors.secondary,
  },
  stageCount: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.textDark,
    marginTop: 6,
  },
  stageLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: isIOS ? 14 : 16,
    padding: 14,
    backgroundColor: isIOS ? 'rgba(255,255,255,0.55)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
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
    backgroundColor: 'rgba(45,79,62,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
  },
  rowSubtitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  rowScore: {
    minWidth: 76,
    alignItems: 'flex-end',
  },
  percent: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
  },
  points: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  stage: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
    marginTop: 4,
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
    color: colors.textDark,
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
    backgroundColor: 'rgba(30, 111, 67, 0.12)',
  },
  statusWrong: {
    color: '#A33A2A',
    backgroundColor: 'rgba(163, 58, 42, 0.12)',
  },
  statusSkipped: {
    color: '#7A5A12',
    backgroundColor: 'rgba(122, 90, 18, 0.12)',
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
    color: colors.textMuted,
    marginTop: 8,
  },
});
