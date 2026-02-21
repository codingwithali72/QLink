import { createBusiness } from './app/actions/admin';

async function testCreate() {
    const res = await createBusiness(
        "Prime Care",
        "prime-care5",
        "+91 9320201572",
        undefined,
        undefined,
        "a4f8d428-ba17-48f0-b883-9388dfbd48fc" // Fake ID, or valid if passed. 
    );
    console.log(res);
}
testCreate();
