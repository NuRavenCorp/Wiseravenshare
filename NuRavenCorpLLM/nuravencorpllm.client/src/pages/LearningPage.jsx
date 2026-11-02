import React, { useMemo, useState } from 'react';
import { MainLayout } from '../components/common/Layout/MainLayout';
import { learningService } from '../services/learningService';

const firstScript = `name = "NuRavenCorpLLM Learner"
print(f"Hello, {name}! Your Python environment is ready.")`;

const syntaxBroken = `if True
print("Python!")`;

const syntaxCorrect = `if True:
    print("Python!")`;

function normalizeCode(value) {
  return value.replace(/\r\n/g, '\n').trim();
}

export default function LearningPage() {
  const [introChoice, setIntroChoice] = useState('');
  const [runChoice, setRunChoice] = useState('');
  const [syntaxAnswer, setSyntaxAnswer] = useState(syntaxBroken);
  const [feedback, setFeedback] = useState({ name: '', section: 'Syntax', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const isSyntaxCorrect = useMemo(
    () => normalizeCode(syntaxAnswer) === normalizeCode(syntaxCorrect),
    [syntaxAnswer]
  );

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitted(false);

    try {
      await learningService.submitConduit({
        name: feedback.name.trim() || null,
        section: feedback.section,
        message: feedback.message
      });
      setSubmitted(true);
      setFeedback({ ...feedback, message: '' });
    } catch (error) {
      setSubmitError(error.message || 'Unable to submit feedback right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout>
      <div className="learning-stack">
        <section className="glass-card">
          <h1 className="panel-title">NuRavenCorpLLM Learning Module: Python Setup &amp; Scripting</h1>
          <p className="tip-text">
            Learn Python setup, write your first script, run it, and practice syntax with quick checks.
          </p>
        </section>

        <section className="glass-card learning-section">
          <h2>1. Introduction to Python</h2>
          <p>
            Python is a beginner-friendly language used for AI, automation, web apps, and data analysis.
            In NuRavenCorpLLM, Python commonly powers inference logic, model tooling, and integrations.
          </p>
          <div className="quiz-card">
            <p className="subtle-title">Quick Check</p>
            <p>What makes Python popular for AI work?</p>
            <label className="quiz-option">
              <input
                type="radio"
                name="intro"
                value="a"
                checked={introChoice === 'a'}
                onChange={(event) => setIntroChoice(event.target.value)}
              />
              Complex syntax
            </label>
            <label className="quiz-option">
              <input
                type="radio"
                name="intro"
                value="b"
                checked={introChoice === 'b'}
                onChange={(event) => setIntroChoice(event.target.value)}
              />
              Readability and strong ML ecosystem
            </label>
            <label className="quiz-option">
              <input
                type="radio"
                name="intro"
                value="c"
                checked={introChoice === 'c'}
                onChange={(event) => setIntroChoice(event.target.value)}
              />
              It only runs in browsers
            </label>
            {introChoice && (
              <p className={introChoice === 'b' ? 'success-text' : 'error-text'}>
                {introChoice === 'b'
                  ? 'Correct. Python readability plus its ML libraries make it a top AI choice.'
                  : 'Not quite. The best answer is readability and a strong ML ecosystem.'}
              </p>
            )}
          </div>
        </section>

        <section className="glass-card learning-section">
          <h2>2. Installation (5-Minute Setup)</h2>
          <ol>
            <li>Install Python 3.11+ from python.org and enable Add Python to PATH.</li>
            <li>Verify install: <code>python --version</code></li>
            <li>Create a virtual environment: <code>python -m venv .venv</code></li>
            <li>Activate: <code>.\.venv\Scripts\Activate.ps1</code> (Windows PowerShell)</li>
          </ol>
          <p className="tip-text">Exercise: verify your version and activate the virtual environment.</p>
        </section>

        <section className="glass-card learning-section">
          <h2>3. Writing Your First Script</h2>
          <p>Create a file named <code>hello_nuraven.py</code>:</p>
          <pre className="code-block">{firstScript}</pre>
          <p className="tip-text">Exercise: change the name value, then run the file again.</p>
        </section>

        <section className="glass-card learning-section">
          <h2>4. Running the Code</h2>
          <p>In an IDE, open the file, choose your Python interpreter, then click Run.</p>
          <p>In terminal:</p>
          <pre className="code-block">python hello_nuraven.py</pre>
          <div className="quiz-card">
            <p className="subtle-title">Quick Check</p>
            <p>Which command runs a Python file?</p>
            <label className="quiz-option">
              <input
                type="radio"
                name="run"
                value="a"
                checked={runChoice === 'a'}
                onChange={(event) => setRunChoice(event.target.value)}
              />
              run hello_nuraven.py
            </label>
            <label className="quiz-option">
              <input
                type="radio"
                name="run"
                value="b"
                checked={runChoice === 'b'}
                onChange={(event) => setRunChoice(event.target.value)}
              />
              python hello_nuraven.py
            </label>
            <label className="quiz-option">
              <input
                type="radio"
                name="run"
                value="c"
                checked={runChoice === 'c'}
                onChange={(event) => setRunChoice(event.target.value)}
              />
              execute hello_nuraven.py
            </label>
            {runChoice && (
              <p className={runChoice === 'b' ? 'success-text' : 'error-text'}>
                {runChoice === 'b' ? 'Correct.' : 'Not quite. Use python hello_nuraven.py.'}
              </p>
            )}
          </div>
        </section>

        <section className="glass-card learning-section">
          <h2>5. Understanding Syntax (Golden Rules)</h2>
          <ol>
            <li>Indentation matters (typically 4 spaces).</li>
            <li>Use a colon after block starters like if, for, while, and def.</li>
            <li>Keep names readable (snake_case).</li>
            <li>Use consistent formatting for readability.</li>
          </ol>
          <p className="subtle-title">Fix-the-Code Exercise</p>
          <p>Correct this snippet:</p>
          <pre className="code-block">{syntaxBroken}</pre>
          <textarea
            className="prompt-area learning-editor"
            value={syntaxAnswer}
            onChange={(event) => setSyntaxAnswer(event.target.value)}
          />
          <p className={isSyntaxCorrect ? 'success-text' : 'tip-text'}>
            {isSyntaxCorrect ? 'Nice work — your corrected syntax is valid.' : 'Tip: add the colon and indent print.'}
          </p>
        </section>

        <section className="glass-card learning-section">
          <h2>Resources and References</h2>
          <div className="resource-list">
            <a href="https://docs.python.org/3/" target="_blank" rel="noreferrer">
              Official Python Documentation
            </a>
            <a href="https://docs.python.org/3/tutorial/" target="_blank" rel="noreferrer">
              Python Tutorial
            </a>
            <a href="https://peps.python.org/pep-0008/" target="_blank" rel="noreferrer">
              PEP 8 Style Guide
            </a>
          </div>
        </section>

        <section className="glass-card learning-section">
          <h2>Feedback &amp; Questions</h2>
          <p className="tip-text">
            Submit questions or feedback for continuous improvements to the learning module.
          </p>
          <form className="feedback-form" onSubmit={handleFeedbackSubmit}>
            <label>
              Name (optional)
              <input
                type="text"
                value={feedback.name}
                onChange={(event) => setFeedback({ ...feedback, name: event.target.value })}
              />
            </label>
            <label>
              Section
              <select
                value={feedback.section}
                onChange={(event) => setFeedback({ ...feedback, section: event.target.value })}
              >
                <option>Introduction</option>
                <option>Installation</option>
                <option>First Script</option>
                <option>Running Code</option>
                <option>Syntax</option>
                <option>Resources</option>
              </select>
            </label>
            <label>
              Question or feedback
              <textarea
                required
                value={feedback.message}
                onChange={(event) => setFeedback({ ...feedback, message: event.target.value })}
              />
            </label>
            <button className="submit-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
          {submitError && <p className="error-text">{submitError}</p>}
          {submitted && (
            <p className="success-text">
              Submitted to the learning pipeline conduit. Thanks for helping improve NuRavenCorpLLM.
            </p>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
