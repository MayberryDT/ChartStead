import {
  COURSE_CHECK_VALIDATION_SCENARIOS,
  type CourseCheckValidationScenario,
} from "../shared/course-check-validation";

/**
 * Deterministic, privacy-free evaluator fixtures. These descriptors drive
 * automated task scripts and a future facilitated session; they are never
 * evidence that a representative human completed the tasks.
 */
export function buildCourseCheckValidationScenarios(): CourseCheckValidationScenario[] {
  return structuredClone(COURSE_CHECK_VALIDATION_SCENARIOS);
}
