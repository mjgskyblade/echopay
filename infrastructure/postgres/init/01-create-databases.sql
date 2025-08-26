-- Create separate databases for each service
CREATE DATABASE echopay_transactions;
CREATE DATABASE echopay_tokens;
CREATE DATABASE echopay_reversibility;
CREATE DATABASE echopay_compliance;

-- Create users for each service (optional, for better security)
CREATE USER transaction_user WITH PASSWORD 'tx_pass_dev';
CREATE USER token_user WITH PASSWORD 'token_pass_dev';
CREATE USER reversibility_user WITH PASSWORD 'rev_pass_dev';
CREATE USER compliance_user WITH PASSWORD 'comp_pass_dev';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE echopay_transactions TO transaction_user;
GRANT ALL PRIVILEGES ON DATABASE echopay_tokens TO token_user;
GRANT ALL PRIVILEGES ON DATABASE echopay_reversibility TO reversibility_user;
GRANT ALL PRIVILEGES ON DATABASE echopay_compliance TO compliance_user;