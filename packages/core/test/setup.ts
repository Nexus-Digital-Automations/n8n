import nock from 'nock';

export default () => {
	nock.disableNetConnect();
};
