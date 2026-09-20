import React, { useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';

const defaultFilters = {
  genre: '',
  country: '',
  language: '',
  band: 'FM'
};

const genres = ['All', 'Pop', 'Rock', 'Jazz', 'Classical', 'News', 'Sports', 'Talk', 'Country', 'HipHop', 'Electronic', 'Reggae', 'Latin'];
const countries = ['All', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Brazil', 'India'];
const languages = ['All', 'English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Arabic', 'Hindi', 'Portuguese'];
const bands = ['All', 'FM', 'AM', 'DAB'];

const FMSearch = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    onSearch?.(query, filters);
  };

  const clear = () => {
    setQuery('');
    setFilters(defaultFilters);
    onSearch?.('', defaultFilters);
  };

  return (
    <form className="fm-search" onSubmit={submit}>
      <div className="fm-search-row">
        <div className="fm-search-input-wrap">
          <FiSearch />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search station, city, frequency…"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="fm-search-clear" aria-label="Clear search">
              <FiX />
            </button>
          )}
        </div>
        <button type="submit" className="fm-btn fm-btn-primary">Search</button>
        <button type="button" className="fm-btn" onClick={() => setShowFilters((prev) => !prev)}>
          {showFilters ? 'Hide Filters' : 'Filters'}
        </button>
        <button type="button" className="fm-btn" onClick={clear}>Clear</button>
      </div>

      {showFilters && (
        <div className="fm-filter-grid">
          <label>
            Genre
            <select value={filters.genre} onChange={(e) => setFilters({ ...filters, genre: e.target.value })}>
              {genres.map((item) => <option key={item} value={item === 'All' ? '' : item}>{item}</option>)}
            </select>
          </label>
          <label>
            Country
            <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}>
              {countries.map((item) => <option key={item} value={item === 'All' ? '' : item}>{item}</option>)}
            </select>
          </label>
          <label>
            Language
            <select value={filters.language} onChange={(e) => setFilters({ ...filters, language: e.target.value })}>
              {languages.map((item) => <option key={item} value={item === 'All' ? '' : item}>{item}</option>)}
            </select>
          </label>
          <label>
            Band
            <select value={filters.band} onChange={(e) => setFilters({ ...filters, band: e.target.value })}>
              {bands.map((item) => <option key={item} value={item === 'All' ? '' : item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}
    </form>
  );
};

export default FMSearch;
