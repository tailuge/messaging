import { t } from '../src/client/i18n.js';

describe('i18n', () => {
    it('should return the key if no translation exists', () => {
        expect(t('Unknown String')).toBe('Unknown String');
    });

    it('should replace parameters', () => {
        expect(t('Hello {name}', { name: 'Jules' })).toBe('Hello Jules');
    });

    it('should handle multiple parameters', () => {
        expect(t('{greeting} {name}', { greeting: 'Hi', name: 'Jules' })).toBe('Hi Jules');
    });
});
