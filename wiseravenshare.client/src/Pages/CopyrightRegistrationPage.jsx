// wiseravenshare.client/src/Pages/CopyrightRegistrationPage.jsx
import React, { useState, useEffect } from 'react';
import api from '../Services/api';
import './CopyrightRegistrationPage.css';

export const CopyrightRegistrationPage = () => {
  const [forms, setForms] = useState([]);
  const [selectedForms, setSelectedForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guidePage, setGuidePage] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [workDescription, setWorkDescription] = useState('');
  const [recommended, setRecommended] = useState(null);
  const [totalCost, setTotalCost] = useState(null);

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    try {
      setLoading(true);
      const response = await api.copyrightRegistrationApi.getForms();
      setForms(response);
      setError(null);
    } catch (err) {
      console.error('Error fetching forms:', err);
      setError('Failed to load copyright registration forms');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSelection = (formCode) => {
    setSelectedForms(prev => {
      if (prev.includes(formCode)) {
        return prev.filter(code => code !== formCode);
      } else {
        return [...prev, formCode];
      }
    });
    setRecommended(null);
  };

  const handleRecommend = async () => {
    if (!workDescription.trim()) {
      setError('Please describe your work to get recommendations');
      return;
    }

    try {
      setLoading(true);
      const response = await api.copyrightRegistrationApi.recommendForms({
        workDescription
      });
      setRecommended(response);
      setSelectedForms(response.map(f => f.formCode));
      setError(null);
    } catch (err) {
      console.error('Error getting recommendations:', err);
      setError('Failed to get form recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateCost = async () => {
    if (selectedForms.length === 0) {
      setError('Please select at least one form');
      return;
    }

    try {
      setLoading(true);
      const response = await api.copyrightRegistrationApi.calculateCost({
        formCodes: selectedForms
      });
      setTotalCost(response);
      setError(null);
    } catch (err) {
      console.error('Error calculating cost:', err);
      setError('Failed to calculate cost');
    } finally {
      setLoading(false);
    }
  };

  const handleViewGuide = async () => {
    try {
      setLoading(true);
      const response = await api.copyrightRegistrationApi.getGuide();
      setGuidePage(response);
      setShowGuide(true);
      setError(null);
    } catch (err) {
      console.error('Error fetching guide:', err);
      setError('Failed to load guide');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintGuide = () => {
    if (guidePage) {
      const printWindow = window.open('', '', 'height=600,width=800');
      printWindow.document.write(guidePage);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleDirectToGov = () => {
    window.open('https://www.copyright.gov/forms/', '_blank');
  };

  if (showGuide && guidePage) {
    return (
      <div className="guide-container">
        <div className="guide-header">
          <button onClick={() => setShowGuide(false)} className="btn-back">← Back to Forms</button>
          <button onClick={handlePrintGuide} className="btn-print">🖨️ Print Guide</button>
        </div>
        <iframe
          srcDoc={guidePage}
          className="guide-iframe"
          title="Copyright Registration Guide"
        />
      </div>
    );
  }

  return (
    <div className="copyright-registration-container">
      <div className="header-section">
        <h1>🏛️ U.S. Copyright Office Registration</h1>
        <p>Protect your music, recordings, and compositions with official copyright registration</p>
        <button onClick={handleViewGuide} className="btn-guide">📚 View Full Guide</button>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="recommendation-section">
        <h2>📋 Get Form Recommendations</h2>
        <p>Describe your work and we'll recommend the best Copyright Office forms for your needs.</p>
        <textarea
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
          placeholder="E.g., I recorded an original music track with vocals and instruments, and I want to protect both my recording and the song composition..."
          rows={4}
          className="description-input"
        />
        <button onClick={handleRecommend} disabled={loading} className="btn-primary">
          {loading ? 'Analyzing...' : '✨ Get Recommendations'}
        </button>

        {recommended && (
          <div className="recommended-section">
            <h3>Recommended Forms for Your Work:</h3>
            {recommended.map(form => (
              <div
                key={form.formCode}
                className={`form-card recommended ${selectedForms.includes(form.formCode) ? 'selected' : ''}`}
                onClick={() => handleFormSelection(form.formCode)}
              >
                <input
                  type="checkbox"
                  checked={selectedForms.includes(form.formCode)}
                  onChange={() => handleFormSelection(form.formCode)}
                />
                <div className="form-content">
                  <h4>{form.formCode}: {form.formName}</h4>
                  <p className="price">${form.priceUsd.toFixed(2)}</p>
                  <p>{form.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="forms-section">
        <h2>📋 All Available Forms</h2>
        <div className="forms-grid">
          {forms.map(form => (
            <div
              key={form.formCode}
              className={`form-card ${selectedForms.includes(form.formCode) ? 'selected' : ''}`}
              onClick={() => handleFormSelection(form.formCode)}
            >
              <div className="form-header">
                <input
                  type="checkbox"
                  checked={selectedForms.includes(form.formCode)}
                  onChange={() => handleFormSelection(form.formCode)}
                />
                <span className="form-code">{form.formCode}</span>
              </div>
              <h3>{form.formName}</h3>
              <p className="work-type">{form.workType}</p>
              <p className="price">${form.priceUsd.toFixed(2)}</p>
              <p className="description">{form.description}</p>
              
              <div className="applies-to">
                <strong>Applies to:</strong>
                <ul>
                  {form.appliesTo.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <a href={form.instructionsUrl} target="_blank" rel="noopener noreferrer" className="link">
                📄 View Instructions
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="pricing-section">
        <h2>💰 Pricing & Registration</h2>
        <div className="pricing-info">
          <p><strong>Zero Markup Pricing:</strong> We charge exactly the U.S. Copyright Office fee with no additional commission or markup.</p>
          <p><strong>Current Forms:</strong> ${forms.reduce((sum, f) => sum + f.priceUsd, 0).toFixed(2)} total for all forms</p>
        </div>

        {selectedForms.length > 0 && (
          <div className="cost-calculation">
            <h3>Selected Forms ({selectedForms.length})</h3>
            <div className="selected-list">
              {forms
                .filter(f => selectedForms.includes(f.formCode))
                .map(f => (
                  <div key={f.formCode} className="selected-item">
                    <span>{f.formCode}: {f.formName}</span>
                    <span className="price">${f.priceUsd.toFixed(2)}</span>
                  </div>
                ))}
            </div>
            <button onClick={handleCalculateCost} disabled={loading} className="btn-calculate">
              {loading ? 'Calculating...' : '🔢 Calculate Total'}
            </button>

            {totalCost && (
              <div className="cost-result">
                <div className="cost-box">
                  <span>Total Registration Cost:</span>
                  <span className="total">${totalCost.totalCostUsd.toFixed(2)}</span>
                </div>
                <p className="note">{totalCost.note}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="action-section">
        <h2>🚀 Next Steps</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Select Forms</h4>
              <p>Choose the Copyright Office forms appropriate for your work above</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Review Cost</h4>
              <p>Calculate the total registration cost (zero markup — exact Copyright Office fee)</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Register at Copyright.gov</h4>
              <p>Visit the U.S. Copyright Office website to complete registration directly</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Receive Certificate</h4>
              <p>Copyright Office will issue your registration certificate within 4-6 weeks</p>
            </div>
          </div>
        </div>
        <button onClick={handleDirectToGov} className="btn-go-to-gov">
          🏛️ Go to Copyright.gov Registration
        </button>
      </div>

      <div className="info-section">
        <h3>ℹ️ Important Information</h3>
        <ul>
          <li>Wiseravenshare does NOT process Copyright Office registrations</li>
          <li>All registrations are completed directly through copyright.gov</li>
          <li>Registration typically takes 4-6 weeks for processing</li>
          <li>The Copyright Office maintains a public searchable database of all registrations</li>
          <li>For legal questions about copyright, consult an attorney</li>
          <li>Contact the Copyright Office at 1-202-707-3000 or copyright.gov/help</li>
        </ul>
      </div>
    </div>
  );
};

export default CopyrightRegistrationPage;
